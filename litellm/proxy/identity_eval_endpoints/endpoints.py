"""
Unified /v1/messages endpoint - (Anthropic Spec)
"""

from datetime import datetime

from fastapi import APIRouter, HTTPException, Request, Response

from litellm._logging import verbose_proxy_logger
from litellm.proxy._types import *
from litellm.proxy.utils import handle_exception_on_proxy

router = APIRouter()


@router.get(
    "/v1/identity_eval",
    tags=["identity_eval"],
    dependencies=[],
    include_in_schema=False,
)
async def identity_eval_response(  # noqa: PLR0915
        fastapi_response: Response,
        request: Request,
):
    from litellm.proxy.proxy_server import prisma_client
    try:
        if prisma_client is None:
            raise HTTPException(
                status_code=500,
                detail={"error": CommonProxyErrors.db_not_connected_error.value},
            )

        # 可视化表图数据，按日期分组，前10条
        date_list_ = await prisma_client.db.litellm_identityeval.group_by(by=["date"], count=True)

        data = {}
        for item in date_list_:
            date = item['date']
            list = await prisma_client.db.litellm_identityeval.find_many(
                where={"date": date},
                order={'model_id': 'desc'}
            )
            date_format = datetime.fromisoformat(date.replace('Z', '+00:00')).strftime('%Y-%m-%d')
            data[date_format] = list

        return {"success": True, "data": data}
    except Exception as e:
        verbose_proxy_logger.exception(e)
        raise handle_exception_on_proxy(e)
