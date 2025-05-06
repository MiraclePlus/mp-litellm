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
  const [selectedModel, setSelectedModel] = useState<string>("all");
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
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

  // Process data for the chart based on filters
  const processChartData = () => {
    // Initialize data structure
    const chartData: {
      dates: string[];
      series: {
        name: string;
        data: number[];
        modelId: string;
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

    // Create a mapping for all model+dataset combinations
    const seriesMap = new Map<
      string,
      {
        name: string;
        data: number[];
        modelId: string;
        datasetKey: string;
      }
    >();

    // Traverse all data to find unique series
    sortedDates.forEach((date) => {
      evalData[date].forEach((result) => {
        // Apply filters
        if (
          (selectedModel === "all" || result.model_id === selectedModel) &&
          (selectedDataset === "all" || result.dataset_key === selectedDataset)
        ) {
          const seriesKey = `${result.model_id} - ${result.dataset_key}`;
          if (!seriesMap.has(seriesKey)) {
            seriesMap.set(seriesKey, {
              name: seriesKey,
              data: Array(sortedDates.length).fill(null),
              modelId: result.model_id,
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
          (selectedModel === "all" || result.model_id === selectedModel) &&
          (selectedDataset === "all" || result.dataset_key === selectedDataset)
        ) {
          const seriesKey = `${result.model_id} - ${result.dataset_key}`;
          const seriesData = seriesMap.get(seriesKey);
          if (seriesData) {
            seriesData.data[dateIndex] = result.score;
          }
        }
      });
    });

    chartData.series = Array.from(seriesMap.values());
    return chartData;
  };

  // Initialize and update chart
  useEffect(() => {
    if (!chartRef.current) return;

    // Initialize chart if not already done
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
    }

    // Resize handler
    const handleResize = () => {
      chartInstance.current?.resize();
    };
    window.addEventListener("resize", handleResize);

    // Process data and update chart
    const chartData = processChartData();
    const option = {
      title: {
        text: "模型评估分数趋势",
        left: "center",
      },
      tooltip: {
        trigger: "axis",
        formatter: function (params: any) {
          let tooltip = `日期: ${params[0].axisValue} <br/>`;
          params.forEach((param: any) => {
            tooltip += `${param.seriesName}: ${param.value !== null && param.value !== undefined ? (param.value * 100).toFixed(1) + "%" : "N/A"}<br/>`;
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
            return value * 100 + "%";
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

    chartInstance.current.setOption(option);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [evalData, selectedModel, selectedDataset]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (chartInstance.current) {
        chartInstance.current.dispose();
      }
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

  return (
    <Card>
      <Title> </Title>
      <Grid numItems={1} className="gap-4">
        <Col>
          <div ref={chartRef} style={{ height: "400px", width: "100%" }} />
        </Col>
      </Grid>
    </Card>
  );
};

export default IdentityEvalChart;
