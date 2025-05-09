import asyncio
from concurrent.futures import ThreadPoolExecutor
import datetime
import logging
from dataclasses import dataclass
from json import dumps
import os
from typing import Optional, Dict, Union

import requests
from evalscope import TaskConfig, run_task
from evalscope.constants import EvalType
from requests.exceptions import RequestException

import litellm
from litellm import Router
from litellm.proxy.utils import PrismaClient

# 设置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

TODAY = f"evalscope/{datetime.datetime.now():%Y-%m-%d}"


@dataclass
class EvalDataset:
    dataset_name: str
    dataset_args: Optional[Dict[str, Union[str, dict]]] = None
    dataset_limit: int = 25
    eval_concurrency: int = 16
    eval_cache: str = f"{TODAY}"


AIME24 = EvalDataset("aime24", {"aime24": {"few_shot_num": 3}})
AIME25 = EvalDataset("aime25", {"aime25": {"few_shot_num": 3}})
GPQA_DIAMOND = EvalDataset(
    "gpqa",
    {"gpqa": {"subset_list": ["gpqa_diamond"], "few_shot_num": 3}},
)
MMLU_PRO_LAW = EvalDataset(
    "mmlu_pro", {"mmlu_pro": {"subset_list": ["law"], "few_shot_num": 3}}
)
MMLU_PRO_BUSINESS = EvalDataset(
    "mmlu_pro", {"mmlu_pro": {"subset_list": ["business"], "few_shot_num": 3}}
)
MMLU_PRO_PHILOSOPHY = EvalDataset(
    "mmlu_pro", {"mmlu_pro": {"subset_list": ["philosophy"], "few_shot_num": 3}}
)
LIVE_CODE_BENCH = EvalDataset(
    "live_code_bench",
    {
        "live_code_bench": {
            "subset_list": ["release_latest"],
            "extra_params": {
                "start_date": "2024-11-28",
                "end_date": "2025-01-01",
            },
            "filters": {"remove_until": "</think>"},
            "few_shot_num": 3,
        }
    },
)

USED_DATASET = {
    "AIME24": AIME24,
    "AIME25": AIME25,
    "GPQA_DIAMOND": GPQA_DIAMOND,
    "MMLU_PRO_LAW": MMLU_PRO_LAW,
    "MMLU_PRO_BUSINESS": MMLU_PRO_BUSINESS,
    "MMLU_PRO_PHILOSOPHY": MMLU_PRO_PHILOSOPHY,
    "LIVE_CODE_BENCH": LIVE_CODE_BENCH,
}

CACHE_PATH = "evalscope/"
TEMPERATURE = 0.0


async def identity_eval_task(
        llm_router: Optional[Router], prisma_client: PrismaClient = None
):
    """
    定时获取所有可用的模型名称并记录

    Args:
        llm_router: LiteLLM Router实例，用于获取模型列表
        prisma_client: 数据库客户端，如果需要将结果存储到数据库
    """

    # 获取所有模型名称
    model_list = llm_router.model_names

    # 创建信号量，限制最多同时运行3个协程
    semaphore = asyncio.Semaphore(6)

    # 创建任务
    tasks = [worker(model_name, USED_DATASET, prisma_client, semaphore) for model_name in model_list]

    # 并发执行所有任务
    await asyncio.gather(*tasks)

    logger.info("所有任务完成")

async def worker(
        model_name: str,
        dataset: dict[str, EvalDataset],
        prisma_client: PrismaClient = None,
        semaphore: asyncio.Semaphore = None,
):
    async with semaphore:  # 获取信号量，如果达到限制会阻塞
        for dataset_key, dataset in dataset.items():
            logger.info(f"开始基准测试模型: {model_name}，数据集: {dataset_key}")

            task_config = TaskConfig(
                model=model_name,
                datasets=[dataset.dataset_name],
                dataset_args=dataset.dataset_args,
                eval_type=EvalType.SERVICE,
                api_url="http://localhost/v1",
                api_key="sk-ZY_wnuzes5znMQV31EXRlw",
                timeout=3600,
                eval_batch_size=dataset.eval_concurrency,
                limit=dataset.dataset_limit,
                generation_config={"temperature": TEMPERATURE, "do_sample": True},
                dataset_dir=CACHE_PATH,
                judge_worker_num=1,  # > 1 could run into deadlock
                use_cache=TODAY,
            )

            # 获取事件循环
            loop = asyncio.get_running_loop()
            # 使用run_in_executor来执行阻塞的run_task操作
            report = await loop.run_in_executor(None, sync_run_task, task_config,dataset.dataset_name,model_name,dataset_key)
            
            if report is None:
                await prisma_client.db.litellm_identityeval.create(
                    {
                        "model_id": model_name,
                        "dataset_key": dataset_key,
                        "dataset_name": dataset.dataset_name,
                        "metric": "",
                        "score": -1,
                        "subset": "",
                        "num": 0,
                        "date": litellm.utils.get_utc_datetime(),
                    }
                )
            else:
                await prisma_client.db.litellm_identityeval.create({
                    "model_id": model_name,
                    "dataset_key": dataset_key,
                    "dataset_name": dataset.dataset_name,
                    "metric": report.metrics[0].name,
                    "score": report.metrics[0].score,
                    "subset": ",".join(report.metrics[0].categories[0].name),
                    "num": report.metrics[0].num,
                    "date": litellm.utils.get_utc_datetime(),
                })

            logger.info(f"基准测试模型: {model_name}，数据集: {dataset_key}，完成")

def sync_run_task(task_config,dataset_name,model_name,dataset_key):
    try:
        report = run_task(task_config)
        report = report[dataset_name]
        return report
    except Exception as e:
        logger.error(f"Error running task for {model_name} on {dataset_key}: {e}")
        send_message_to_feishu(
            f"Error running task for [{model_name}] on [{dataset_key}]: {e}",
            webhook_url="https://open.feishu.cn/open-apis/bot/v2/hook/52d1469f-1fed-40ee-aa7b-39df5159c945",
        )
        return None


def send_message_to_feishu(param, webhook_url):
    # Send a message to Feishu
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    data = {
        "msg_type": "text",
        "content": {
            "text": param,
        },
    }
    try:
        response = requests.post(webhook_url, headers=headers, data=dumps(data))
        response.raise_for_status()
    except RequestException as e:
        print(f"Error sending message to Feishu: {e}")
