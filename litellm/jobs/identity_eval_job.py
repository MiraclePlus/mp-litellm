import asyncio
import datetime
import logging
from dataclasses import dataclass
from typing import Optional, Dict, Union

from evalscope import TaskConfig, run_task
from evalscope.constants import EvalType

import litellm
from litellm import Router
from litellm.proxy.utils import PrismaClient

# 设置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

TODAY = f"{datetime.datetime.now():%Y-%m-%d}"


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
    "gpqa_diamond",
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

USED_DATASET = (
    AIME24,
    AIME25,
    GPQA_DIAMOND,
    MMLU_PRO_LAW,
    MMLU_PRO_BUSINESS,
    MMLU_PRO_PHILOSOPHY,
    LIVE_CODE_BENCH,
)

APIURL = ""
APIKEY = ""
CACHE_PATH = ""
TEMPERATURE = 0.0


async def async_identity_eval_task(llm_router: Optional[Router], prisma_client: PrismaClient = None):
    loop = asyncio.get_running_loop()
    # 将阻塞操作放入线程池
    await loop.run_in_executor(None, identity_eval_task, llm_router, prisma_client)


def identity_eval_task(llm_router: Optional[Router], prisma_client: PrismaClient = None):
    """
    定时获取所有可用的模型名称并记录

    Args:
        llm_router: LiteLLM Router实例，用于获取模型列表
        prisma_client: 数据库客户端，如果需要将结果存储到数据库
    """
    # 获取所有模型名称
    model_list = llm_router.get_model_list()
    model_list = {model['litellm_params']['model']: model for model in model_list}

    for model_name in model_list:
        for dataset in USED_DATASET:
            logger.info(f"开始基准测试模型: {model_name}，数据集: {dataset.dataset_name}")

            try:
                task_config = TaskConfig(
                    model=model_name,
                    datasets=[dataset.dataset_name],
                    dataset_args=dataset.dataset_args,
                    eval_type=EvalType.SERVICE,
                    api_url="http://localhost/v1",
                    # api_key="sk-ZY_wnuzes5znMQV31EXRlw", 生产环境的
                    api_key="sk-ZY_wnuzes5znMQV31EXRlw",
                    timeout=3600,
                    eval_batch_size=dataset.eval_concurrency,
                    limit=dataset.dataset_limit,
                    generation_config={"temperature": TEMPERATURE, "do_sample": True},
                    dataset_dir=CACHE_PATH,
                    judge_worker_num=1,  # > 1 could run into deadlock
                    use_cache=TODAY,
                )

                report = run_task(task_config)[dataset.dataset_name]

                rslt = {
                    "model_id": model_name,
                    "dataset_name": (
                        f"{dataset.dataset_name}"
                        if not dataset.dataset_args
                           or not dataset.dataset_args.get("subset_list")
                        else f"{dataset.dataset_name}_{'_'.join(dataset.dataset_args['subset_list'])}"
                    ),  # type: ignore
                    "metric": report.metrics[0].name,
                    "score": report.metrics[0].score,
                }
                rslt["date"] = litellm.utils.get_utc_datetime()

                create = prisma_client.db.litellm_identityeval.create(rslt)
                print(create)
            except Exception as e:
                print(f"Error running task for {model_name} on {dataset.dataset_name}: {e}")
                send_message_to_feishu(
                    f"Error running task for [{model_name}] on [{dataset.dataset_name}]: {e}",
                    webhook_url="https://open.feishu.cn/open-apis/bot/v2/hook/139459dc-960e-4170-a356-9e1935c1e24e",
                )
                identity_eval_create = prisma_client.db.litellm_identityeval.create(
                    {'model_id': model_name, 'dataset_name': dataset.dataset_name, 'metric': 'AveragePass@1',
                     'score': 0, 'date': litellm.utils.get_utc_datetime()})
                print(identity_eval_create)
                continue


def send_message_to_feishu(param, webhook_url):
    # Send a message to Feishu
    import requests
    from requests.exceptions import RequestException
    from json import dumps
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
