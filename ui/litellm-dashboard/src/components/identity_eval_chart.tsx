/**
 * New Usage Page
 *
 * Uses the new `/user/daily/activity` endpoint to get daily activity data for a user.
 *
 * Works at 1m+ spend logs, by querying an aggregate table instead.
 */

import React, { useState, useEffect, useRef } from "react";
import {
  Card,
  Title,
  Text,
  Grid,
  Col,
  Select,
  SelectItem,
} from "@tremor/react";
import * as echarts from "echarts";

import { identityEvalCall } from "./networking";

import { Team } from "./key_team_helpers/key_list";

interface ModelTestResult {
  id: number;
  model_id: string;
  dataset_key: string;
  dataset_name: string;
  metric: string;
  score: number;
  subset: string;
  num: number;
  date: string;
  created_at: string;
  updated_at: string;
}

interface IdentityEvalData {
  [date: string]: ModelTestResult[];
}

interface IdentityEvalChartProps {
  accessToken: string | null;
  userID?: string | null;
  userRole?: string | null;
  teams?: Team[] | null;
}

const IdentityEvalChart: React.FC<IdentityEvalChartProps> = ({
  accessToken,
}) => {
  const [evalData, setEvalData] = useState<IdentityEvalData>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDataset, setSelectedDataset] = useState<string>("all");
  const [modelCharts, setModelCharts] = useState<{
    [modelId: string]: React.RefObject<HTMLDivElement>;
  }>({});
  const chartInstances = useRef<{ [modelId: string]: echarts.ECharts }>({});

  // Fetch eval data
  useEffect(() => {
    const fetchEvalData = async () => {
      try {
        setLoading(true);
        if (!accessToken) {
          return;
        }

        const data = await identityEvalCall(accessToken, {});
        setEvalData(data);
        setLoading(false);
      } catch (err) {
        console.error("获取评估数据错误:", err);
        setError("获取评估数据时出错");
        setLoading(false);
      }
    };

    fetchEvalData();
  }, [accessToken]);

  // Create refs for each model's chart
  useEffect(() => {
    if (Object.keys(evalData).length === 0) return;

    // Get all unique model IDs
    const allModelIds = new Set<string>();
    Object.values(evalData).forEach((results) => {
      results.forEach((result) => {
        allModelIds.add(result.model_id);
      });
    });

    // Create refs for each model
    const newModelCharts: {
      [modelId: string]: React.RefObject<HTMLDivElement>;
    } = {};
    allModelIds.forEach((modelId) => {
      newModelCharts[modelId] = React.createRef<HTMLDivElement>();
    });

    setModelCharts(newModelCharts);
  }, [evalData]);

  // Process data for each model's chart
  const processChartData = (modelId: string) => {
    const chartData: {
      dates: string[];
      series: {
        name: string;
        data: number[];
        datasetKey: string;
      }[];
    } = {
      dates: [],
      series: [],
    };

    // If no data, return empty structure
    if (Object.keys(evalData).length === 0) {
      return chartData;
    }

    // Get sorted dates
    const sortedDates = Object.keys(evalData).sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime()
    );
    chartData.dates = sortedDates;

    // Create a mapping for dataset combinations for this model
    const seriesMap = new Map<
      string,
      {
        name: string;
        data: number[];
        datasetKey: string;
      }
    >();

    // Traverse all data to find unique series for this model
    sortedDates.forEach((date) => {
      evalData[date].forEach((result) => {
        // Only process data for the specified model ID
        if (
          result.model_id === modelId &&
          (selectedDataset === "all" || result.dataset_key === selectedDataset)
        ) {
          if (!seriesMap.has(result.dataset_key)) {
            seriesMap.set(result.dataset_key, {
              name: result.dataset_key,
              data: Array(sortedDates.length).fill(null),
              datasetKey: result.dataset_key,
            });
          }
        }
      });
    });

    // Fill in the data for each series
    sortedDates.forEach((date, dateIndex) => {
      evalData[date].forEach((result) => {
        if (
          result.model_id === modelId &&
          (selectedDataset === "all" || result.dataset_key === selectedDataset)
        ) {
          const seriesData = seriesMap.get(result.dataset_key);
          if (seriesData) {
            seriesData.data[dateIndex] = result.score;
          }
        }
      });
    });

    chartData.series = Array.from(seriesMap.values());
    return chartData;
  };

  // Initialize and update charts
  useEffect(() => {
    if (Object.keys(modelCharts).length === 0) return;

    // Create or update chart for each model
    Object.entries(modelCharts).forEach(([modelId, chartRef]) => {
      if (!chartRef.current) return;

      // Initialize chart if not already done
      if (!chartInstances.current[modelId]) {
        chartInstances.current[modelId] = echarts.init(chartRef.current);
      }

      // Process data and update chart
      const chartData = processChartData(modelId);
      const option = {
        title: {
          text: `模型 ${modelId} 评估分数趋势`,
          left: "center",
        },
        tooltip: {
          trigger: "axis",
          formatter: function (params: any) {
            let tooltip = `日期: ${params[0].axisValue} <br/>`;
            params.forEach((param: any) => {
              tooltip += `${param.seriesName}: ${param.value !== null && param.value !== undefined ? param.value : "N/A"}<br/>`;
            });
            return tooltip;
          },
        },
        legend: {
          data: chartData.series.map((s) => s.name),
          type: "scroll",
          orient: "horizontal",
          bottom: 0,
        },
        grid: {
          left: "3%",
          right: "4%",
          bottom: "15%",
          top: "15%",
          containLabel: true,
        },
        xAxis: {
          type: "category",
          boundaryGap: false,
          data: chartData.dates.map((date) => {
            const d = new Date(date);
            return `${d.getMonth() + 1}/${d.getDate()}`;
          }),
        },
        yAxis: {
          type: "value",
          min: 0,
          max: 1,
          axisLabel: {
            formatter: function (value: number) {
              return value;
            },
          },
        },
        series: chartData.series.map((series) => ({
          name: series.name,
          type: "line",
          data: series.data,
          smooth: true,
          connectNulls: true,
          symbol: "circle",
          symbolSize: 6,
          lineStyle: {
            width: 2,
          },
        })),
      };

      chartInstances.current[modelId].setOption(option);
    });

    // Resize handler
    const handleResize = () => {
      Object.values(chartInstances.current).forEach((chart) => {
        chart?.resize();
      });
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [evalData, selectedDataset, modelCharts]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      Object.values(chartInstances.current).forEach((chart) => {
        chart?.dispose();
      });
    };
  }, []);

  if (loading)
    return (
      <Card>
        <Text>加载中...</Text>
      </Card>
    );
  if (error)
    return (
      <Card>
        <Text>错误: {error}</Text>
      </Card>
    );

  // Render dataset filter and charts for each model
  return (
    <Card>
      <Title className="mb-4">模型评估数据</Title>

      {Object.entries(modelCharts).map(([modelId, chartRef]) => (
        <Card key={modelId} className="mb-4">
          <Title>{modelId}</Title>
          <div ref={chartRef} style={{ height: "400px", width: "100%" }} />
        </Card>
      ))}
    </Card>
  );
};

export default IdentityEvalChart;
