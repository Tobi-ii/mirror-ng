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

  const rawForecast = data.forecast || {}
  const forecast = Array.isArray(rawForecast) ? { forecast: [], trend: 'stable', daily_avg: 0, weekly_projection: 0 } : rawForecast
  const { anomalies } = data
  const TrendIcon = forecast.trend === 'increasing' ? TrendingUp : forecast.trend === 'decreasing' ? TrendingDown : Minus
  const trendColor = forecast.trend === 'increasing' ? 'text-rose-400' : forecast.trend === 'decreasing' ? 'text-emerald-400' : 'text-slate-400'

  const maxSpend = Math.max(...(forecast.forecast?.map(f => f.predicted_spend) || [1]))

  return (
    <div className="space-y-6 sm:space-y-10">
      {/* Forecast */}
      <div className="bg-[#0a0c10] border border-white/5 rounded-2xl sm:rounded-[2rem] p-4 sm:p-6 md:p-8">
        <div className="flex items-start justify-between mb-4 sm:mb-6 gap-3">
          <div className="min-w-0">
            <h3 className="text-lg sm:text-xl font-black text-white uppercase tracking-tight">7-Day Spend Forecast</h3>
            <p className="text-[10px] sm:text-xs text-slate-500 mt-1">Linear regression on your transaction history</p>
          </div>
          <div className={`flex items-center gap-1.5 sm:gap-2 ${trendColor} bg-white/5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full shrink-0`}>
            <TrendIcon size={12} />
            <span className="text-[9px] sm:text-xs font-black uppercase tracking-widest">{forecast.trend}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:gap-4 mb-6 sm:mb-8">
          <div className="bg-white/5 rounded-xl sm:rounded-2xl p-3 sm:p-4">
            <p className="text-[8px] sm:text-[10px] text-slate-500 uppercase tracking-widest mb-1">Daily Avg</p>
            <p className="text-lg sm:text-2xl font-black text-white">{fmt(forecast.daily_avg)}</p>
          </div>
          <div className="bg-white/5 rounded-xl sm:rounded-2xl p-3 sm:p-4">
            <p className="text-[8px] sm:text-[10px] text-slate-500 uppercase tracking-widest mb-1">Next 7 Days</p>
            <p className="text-lg sm:text-2xl font-black text-rose-400">{fmt(forecast.weekly_projection)}</p>
          </div>
        </div>

        {/* Bar chart */}
        {forecast.forecast?.length > 0 && (
          <div className="space-y-1.5 sm:space-y-2">
            <p className="text-[8px] sm:text-[10px] text-slate-600 uppercase tracking-widest mb-2 sm:mb-4">Projected Daily Spend</p>
            {forecast.forecast.map((f, i) => {
              const pct = maxSpend > 0 ? (f.predicted_spend / maxSpend) * 100 : 0
              const date = new Date(f.date + 'T00:00:00')
              return (
                <div key={i} className="flex items-center gap-1.5 sm:gap-3">
                  <span className="text-[8px] sm:text-[10px] text-slate-500 w-12 sm:w-16 font-mono flex-shrink-0">
                    {date.toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric' })}
                  </span>
                  <div className="flex-1 h-4 sm:h-6 bg-white/5 rounded overflow-hidden">
                    <div
                      className="h-full bg-indigo-600/70 rounded transition-all duration-700"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[8px] sm:text-[10px] text-slate-400 font-mono w-16 sm:w-20 text-right flex-shrink-0">
                    {fmt(f.predicted_spend)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Anomalies */}
      <div className="bg-[#0a0c10] border border-white/5 rounded-2xl sm:rounded-[2rem] p-4 sm:p-6 md:p-8">
        <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
          <AlertTriangle size={16} className="text-amber-400 shrink-0" />
          <h3 className="text-base sm:text-xl font-black text-white uppercase tracking-tight">Anomaly Detection</h3>
          <span className="bg-amber-400/10 text-amber-400 text-[9px] sm:text-xs font-black px-2 py-0.5 rounded-full shrink-0">
            {anomalies.length} flagged
          </span>
        </div>

        {anomalies.length === 0 ? (
          <p className="text-xs sm:text-sm text-slate-500">No unusual transactions detected. Spend looks consistent.</p>
        ) : (
          <div className="space-y-2 sm:space-y-3">
            {anomalies.map((tx, i) => (
              <div key={i} className="flex items-start gap-2 sm:gap-4 p-3 sm:p-4 bg-amber-400/5 border border-amber-400/10 rounded-xl sm:rounded-2xl">
                <AlertTriangle size={12} className="text-amber-400 flex-shrink-0 mt-0.5 sm:mt-1" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] sm:text-sm font-black text-white truncate">{tx.narration}</p>
                  <p className="text-[9px] sm:text-xs text-amber-400/70 mt-0.5">{tx.anomaly_reason}</p>
                </div>
                <span className="text-[11px] sm:text-sm font-black text-rose-400 flex-shrink-0">
                  ₦{Number(tx.amount).toLocaleString('en-NG')}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-white/5">
          <p className="text-[8px] sm:text-[10px] text-slate-600 leading-relaxed">
            Z-score anomaly detection · Flags transactions deviating &gt;2σ from category mean · 
            Model improves as more transactions are synced
          </p>
        </div>
      </div>
    </div>
  )
}