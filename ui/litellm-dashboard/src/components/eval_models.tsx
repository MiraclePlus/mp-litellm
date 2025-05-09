/**
 * 评估模型组件
 *
 * 展示模型和它们关联的数据集，允许用户选择或取消选择数据集
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  Card,
  Title,
  Text,
  Grid,
  Col,
  Table,
  TableHead,
  TableRow,
  TableHeaderCell,
  TableBody,
  TableCell,
} from "@tremor/react";
import { Checkbox, message, Spin } from "antd";
import type { CheckboxChangeEvent } from "antd/es/checkbox";

import { evalModelsCall, evalModelsUpdateCall } from "./networking";

interface EvalModelsProps {
  accessToken: string | null;
}

// 定义支持的数据集列表
const SUPPORTED_DATASETS = [
  "AIME24",
  "AIME25",
  "GPQA_DIAMOND",
  "MMLU_PRO_LAW",
  "MMLU_PRO_BUSINESS",
  "MMLU_PRO_PHILOSOPHY",
  "LIVE_CODE_BENCH",
];

interface ModelData {
  model_id: string;
  model_name: string;
  dataset_keys: string[];
}

const EvalModels: React.FC<EvalModelsProps> = ({ accessToken }) => {
  const [evalModels, setEvalModels] = useState<ModelData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    const fetchEvalModels = async () => {
      try {
        const data = await evalModelsCall(accessToken);
        setEvalModels(data || []);
        setLoading(false);
      } catch (err) {
        setError(err as string);
        setLoading(false);
      }
    };

    if (accessToken) {
      fetchEvalModels();
    }
  }, [accessToken]);

  const handleCheckboxChange = useCallback(
    async (modelId: string, datasetKey: string, checked: boolean) => {
      try {
        setUpdating(modelId);

        // 查找当前模型
        const model = evalModels.find((m) => m.model_id === modelId);
        if (!model) return;

        // 创建新的数据集键列表
        let newDatasetKeys: string[] = [...model.dataset_keys];

        if (checked && !newDatasetKeys.includes(datasetKey)) {
          // 如果勾选且不在列表中，则添加
          newDatasetKeys.push(datasetKey);
        } else if (!checked && newDatasetKeys.includes(datasetKey)) {
          // 如果取消勾选且在列表中，则移除
          newDatasetKeys = newDatasetKeys.filter((key) => key !== datasetKey);
        }

        // 确保 datasetKeys 是一个数组，即使是空数组
        if (!Array.isArray(newDatasetKeys)) {
          newDatasetKeys = [];
        }

        // 日志记录以便调试
        console.log("更新数据集选择:", {
          model_id: modelId,
          dataset_keys: newDatasetKeys,
        });

        // 构建包含所有模型的数据
        const modelsData = evalModels.map((m) => ({
          model_id: m.model_name,
          dataset_keys:
            m.model_id === modelId ? newDatasetKeys : m.dataset_keys,
        }));

        // 调用API更新模型的数据集选择
        await evalModelsUpdateCall(accessToken, modelsData);

        // 更新本地状态
        setEvalModels((prevModels) =>
          prevModels.map((m) =>
            m.model_id === modelId ? { ...m, dataset_keys: newDatasetKeys } : m
          )
        );

        message.success("数据集选择已更新");
      } catch (err: any) {
        console.error("更新数据集选择失败:", err);
        message.error(`更新失败: ${err.message || "未知错误"}`);
      } finally {
        setUpdating(null);
      }
    },
    [accessToken, evalModels]
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Spin tip="加载中..." />
      </div>
    );
  }

  if (error) {
    return <div className="text-red-500">错误: {error}</div>;
  }

  return (
    <div className="p-4">
      <Title>评估模型</Title>
      <Text>选择要为每个模型评估的数据集</Text>

      <Card className="mt-4">
        <Table className="mt-5">
          <TableHead>
            <TableRow>
              <TableHeaderCell>模型名称</TableHeaderCell>
              {SUPPORTED_DATASETS.map((dataset) => (
                <TableHeaderCell key={dataset}>{dataset}</TableHeaderCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {evalModels.length > 0 ? (
              evalModels.map((model) => (
                <TableRow key={model.model_id}>
                  <TableCell>{model.model_name}</TableCell>
                  {SUPPORTED_DATASETS.map((dataset) => (
                    <TableCell key={`${model.model_id}-${dataset}`}>
                      <Checkbox
                        checked={
                          Array.isArray(model.dataset_keys) &&
                          model.dataset_keys.includes(dataset)
                        }
                        onChange={(e: CheckboxChangeEvent) =>
                          handleCheckboxChange(
                            model.model_id,
                            dataset,
                            e.target.checked
                          )
                        }
                        disabled={updating === model.model_id}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={SUPPORTED_DATASETS.length + 1}>
                  <div className="text-center py-4">无可用的评估模型</div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};

export default EvalModels;
