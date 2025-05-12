"""
Unified /v1/messages endpoint - (Anthropic Spec)
"""

from datetime import datetime
import json
from typing import List, Dict, Any, Optional

from fastapi import APIRouter, HTTPException, Request, Response, Body, Depends
from pydantic import BaseModel, Field

from litellm._logging import verbose_proxy_logger
from litellm.proxy._types import *
from litellm.proxy.utils import handle_exception_on_proxy
from litellm.proxy.proxy_server import user_api_key_auth

router = APIRouter()


class EvalModelItem(BaseModel):
    model_id: str
    dataset_keys: List[str] = Field(default_factory=list)


class EvalModelsRequest(BaseModel):
    models: List[EvalModelItem]


@router.get(
    "/v1/eval_models",
    tags=["eval_models"],
    dependencies=[],
    include_in_schema=False,
)
async def eval_models_response(
        fastapi_response: Response,
        request: Request,
):
    from litellm.proxy.proxy_server import prisma_client, litellm, llm_router
    try:
        if prisma_client is None:
            raise HTTPException(
                status_code=500,
                detail={"error": CommonProxyErrors.db_not_connected_error.value},
            )

        # 查询所有的LiteLLM_ProxyModelTable数据
        # db_model_list = await prisma_client.db.litellm_proxymodeltable.find_many()
        db_model_list = llm_router.model_list
        print('aaa', db_model_list)

        # 将Prisma模型转换为普通字典列表
        model_list = []
        for model in db_model_list:
            # 创建一个新的字典，包含模型的所有属性
            model_dict = {
                "model_id": model["model_name"],
                "model_name": model["model_name"],
                "litellm_params": model["litellm_params"],
                "model_info": model["model_info"],
                "created_at": model.get("created_at"),
                "created_by": model.get("created_by"),
                "updated_at": model.get("updated_at"),
                "updated_by": model.get("updated_by"),
                "dataset_keys": []  # 默认为空数组
            }
            model_list.append(model_dict)

        # 尝试从Redis中读取identity_eval_models键
        redis_data = None
        try:
            if litellm.cache is not None and hasattr(litellm.cache, 'cache') and litellm.cache.cache is not None:
                # 从redis中获取identity_eval_models键
                redis_result = litellm.cache.cache.redis_client.get("identity_eval_models")
                if redis_result:
                    redis_data = json.loads(redis_result)
                    verbose_proxy_logger.debug(f"从Redis读取到identity_eval_models数据: {redis_data}")
        except Exception as e:
            verbose_proxy_logger.exception(f"读取Redis数据失败: {str(e)}")
            redis_data = None

        # 如果读取到了Redis数据，将dataset_keys添加到相应的模型中
        if redis_data and isinstance(redis_data, list):
            # 创建model_id到dataset_keys的映射
            model_dataset_map = {item.get("model_id", ""): item.get("dataset_keys", []) for item in redis_data if "model_id" in item}

            # 更新model_list中的每个model的dataset_keys
            for model_dict in model_list:
                model_name = model_dict.get("model_name", "")
                if model_name in model_dataset_map:
                    model_dict["dataset_keys"] = model_dataset_map[model_name]

        return {"success": True, "data": model_list}
    except Exception as e:
        verbose_proxy_logger.exception(e)
        raise handle_exception_on_proxy(e)


@router.post(
    "/v1/eval_models/set",
    tags=["eval_models"],
    include_in_schema=False,
)
async def set_eval_models(
    request: Request,
    models_data: List[Dict[str, Any]] = Body(...),
):
    """
    设置identity_eval_models数据到Redis（不使用依赖项认证）

    请求体格式: [{"model_id":"xai/grok-3","dataset_keys":["LIVE_CODE_BENCH","AIME25"]}]
    """
    from litellm.proxy.proxy_server import litellm
    try:

        for item in models_data:
            if not isinstance(item, dict):
                raise HTTPException(
                    status_code=400,
                    detail={"error": "数组中的每个元素必须是对象格式"},
                )

            if "model_id" not in item:
                raise HTTPException(
                    status_code=400,
                    detail={"error": "每个对象必须包含model_id字段"},
                )

            if "dataset_keys" in item and not isinstance(item["dataset_keys"], list):
                raise HTTPException(
                    status_code=400,
                    detail={"error": "dataset_keys必须是数组格式"},
                )

        # 将数据存入Redis
        try:
            if litellm.cache is not None and hasattr(litellm.cache, 'cache') and litellm.cache.cache is not None:
                litellm.cache.cache.redis_client.set("identity_eval_models", json.dumps(models_data))
                verbose_proxy_logger.debug(f"成功将数据写入Redis: {models_data}")
                return {"success": True, "message": "数据已成功写入Redis"}
            else:
                raise HTTPException(
                    status_code=500,
                    detail={"error": "Redis缓存未初始化"},
                )
        except Exception as e:
            verbose_proxy_logger.exception(f"写入Redis数据失败: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail={"error": f"写入Redis数据失败: {str(e)}"},
            )
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        verbose_proxy_logger.exception(e)
        raise handle_exception_on_proxy(e)

