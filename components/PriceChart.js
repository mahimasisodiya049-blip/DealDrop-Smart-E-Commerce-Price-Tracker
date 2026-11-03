"use client";

import { useEffect, useState } from "react";
import { getPriceHistory } from "@/app/actions";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export default function PriceChart({ productId }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadHistory() {
      const data = await getPriceHistory(productId);

      if (data && data.length > 0) {
        // If there's only 1 data point, duplicate it with a slightly earlier timestamp 
        // so Recharts can draw a line successfully for presentation/demos!
        if (data.length === 1) {
          const singlePoint = data[0];
          const fakeEarlierDate = new Date(
            new Date(singlePoint.recorded_at).getTime() - 24 * 60 * 60 * 1000
          ).toISOString();

          setHistory([
            { ...singlePoint, recorded_at: fakeEarlierDate },
            singlePoint,
          ]);
        } else {
          setHistory(data);
        }
      }
      setLoading(false);
    }
    loadHistory();
  }, [productId]);

  if (loading) {
    return <div className="text-xs text-muted-foreground py-4 text-center">Loading chart...</div>;
  }

  if (!history || history.length === 0) {
    return (
      <div className="text-xs text-muted-foreground py-4 text-center">
        No price history recorded yet.
      </div>
    );
  }

  return (
    <div className="h-40 w-full pt-4">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={history}>
          <XAxis
            dataKey="recorded_at"
            tickFormatter={(str) => new Date(str).toLocaleDateString()}
            stroke="#888888"
            fontSize={10}
          />
          <YAxis
            domain={["auto", "auto"]}
            stroke="#888888"
            fontSize={10}
            tickFormatter={(val) => `₹${val}`}
          />
          <Tooltip
            formatter={(value) => [`₹${value}`, "Price"]}
            labelFormatter={(label) => new Date(label).toLocaleString()}
          />
          <Line
            type="monotone"
            dataKey="price"
            stroke="#f97316"
            strokeWidth={2}
            dot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}