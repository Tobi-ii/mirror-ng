import { useState, useEffect } from 'react'
import { api } from '../services/api'
import { TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react'

export default function InsightsPanel({ userId }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getInsights(userId).then(res => {
      if (res.success) setData(res)
    }).finally(() => setLoading(false))
  }, [userId])

  const fmt = (n) => `₦${Number(n).toLocaleString('en-NG', { minimumFractionDigits: 0 })}`

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
    </div>
  )

  if (!data) return <p className="text-slate-500 text-sm">No insight data available.</p>

  const { forecast, anomalies } = data
  const TrendIcon = forecast.trend === 'increasing' ? TrendingUp : forecast.trend === 'decreasing' ? TrendingDown : Minus
  const trendColor = forecast.trend === 'increasing' ? 'text-rose-400' : forecast.trend === 'decreasing' ? 'text-emerald-400' : 'text-slate-400'

  const maxSpend = Math.max(...(forecast.forecast?.map(f => f.predicted_spend) || [1]))

  return (
    <div className="space-y-10">
      {/* Forecast */}
      <div className="bg-[#0a0c10] border border-white/5 rounded-[2rem] p-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h3 className="text-xl font-black text-white uppercase tracking-tight">7-Day Spend Forecast</h3>
            <p className="text-xs text-slate-500 mt-1">Linear regression on your transaction history</p>
          </div>
          <div className={`flex items-center gap-2 ${trendColor} bg-white/5 px-3 py-1.5 rounded-full`}>
            <TrendIcon size={14} />
            <span className="text-xs font-black uppercase tracking-widest">{forecast.trend}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="bg-white/5 rounded-2xl p-4">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Daily Avg</p>
            <p className="text-2xl font-black text-white">{fmt(forecast.daily_avg)}</p>
          </div>
          <div className="bg-white/5 rounded-2xl p-4">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Next 7 Days</p>
            <p className="text-2xl font-black text-rose-400">{fmt(forecast.weekly_projection)}</p>
          </div>
        </div>

        {/* Bar chart */}
        {forecast.forecast?.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-4">Projected Daily Spend</p>
            {forecast.forecast.map((f, i) => {
              const pct = maxSpend > 0 ? (f.predicted_spend / maxSpend) * 100 : 0
              const date = new Date(f.date + 'T00:00:00')
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-[10px] text-slate-500 w-16 font-mono flex-shrink-0">
                    {date.toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric' })}
                  </span>
                  <div className="flex-1 h-6 bg-white/5 rounded-lg overflow-hidden">
                    <div
                      className="h-full bg-indigo-600/70 rounded-lg transition-all duration-700"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono w-20 text-right flex-shrink-0">
                    {fmt(f.predicted_spend)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Anomalies */}
      <div className="bg-[#0a0c10] border border-white/5 rounded-[2rem] p-8">
        <div className="flex items-center gap-3 mb-6">
          <AlertTriangle size={20} className="text-amber-400" />
          <h3 className="text-xl font-black text-white uppercase tracking-tight">Anomaly Detection</h3>
          <span className="bg-amber-400/10 text-amber-400 text-xs font-black px-2 py-0.5 rounded-full">
            {anomalies.length} flagged
          </span>
        </div>

        {anomalies.length === 0 ? (
          <p className="text-slate-500 text-sm">No unusual transactions detected. Spend looks consistent.</p>
        ) : (
          <div className="space-y-3">
            {anomalies.map((tx, i) => (
              <div key={i} className="flex items-start gap-4 p-4 bg-amber-400/5 border border-amber-400/10 rounded-2xl">
                <AlertTriangle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-white truncate">{tx.narration}</p>
                  <p className="text-xs text-amber-400/70 mt-0.5">{tx.anomaly_reason}</p>
                </div>
                <span className="text-sm font-black text-rose-400 flex-shrink-0">
                  ₦{Number(tx.amount).toLocaleString('en-NG')}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 pt-6 border-t border-white/5">
          <p className="text-[10px] text-slate-600 leading-relaxed">
            Z-score anomaly detection · Flags transactions deviating &gt;2σ from category mean · 
            Model improves as more transactions are synced
          </p>
        </div>
      </div>
    </div>
  )
}