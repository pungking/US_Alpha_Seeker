
import React from 'react';
import { ApiStatus, ApiProvider } from '../types';

interface Props {
  status: ApiStatus;
  isAuthConnected?: boolean;
}

const ApiStatusCard: React.FC<Props> = ({ status, isAuthConnected }) => {
  const isCloudService = status.provider === ApiProvider.GOOGLE_DRIVE || status.provider === ApiProvider.GEMINI;
  const effectiveConnected = isCloudService ? (isAuthConnected || status.isConnected) : status.isConnected;

  const getStatusDetail = () => {
    if (!effectiveConnected) return { label: 'DISCONNECTED', code: '401 AUTH', color: 'text-red-500', bgColor: 'bg-red-500' };
    if (status.latency > 0 && status.latency < 50) return { label: 'OPTIMAL', code: '200 OK', color: 'text-emerald-400', bgColor: 'bg-emerald-500' };
    if (status.latency < 150) return { label: 'STABLE', code: '200 OK', color: 'text-blue-400', bgColor: 'bg-blue-500' };
    return { label: 'DEGRADED', code: '429 BUSY', color: 'text-amber-400', bgColor: 'bg-amber-500' };
  };

  const detail = getStatusDetail();

  return (
    <div className={`glass-panel p-5 rounded-2xl flex flex-col justify-between border-t-2 shadow-xl transition-all group relative overflow-hidden min-h-[190px] ${effectiveConnected ? 'border-t-slate-700 hover:border-t-blue-500 hover:bg-slate-800/80' : 'border-t-red-900 bg-red-950/10'}`}>
      <div className={`absolute -right-2 -top-2 w-12 h-12 rounded-full opacity-10 blur-2xl ${detail.bgColor}`}></div>
      
      {/* Header Area - Fixed Height for Alignment */}
      <div className="h-14">
        <div className="flex justify-between items-start">
          <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] group-hover:text-slate-300 transition-colors truncate pr-2">{status.provider}</h3>
          <div className={`flex-none w-2.5 h-2.5 rounded-full mt-1 ${effectiveConnected ? `${detail.bgColor} shadow-[0_0_12px_rgba(16,185,129,0.8)]` : 'bg-red-500 animate-pulse'}`}></div>
        </div>
        <p className={`text-[9px] font-black ${detail.color} mt-1.5 tracking-wider uppercase flex items-center`}>
          <span className="inline-block w-1.5 h-1.5 rounded-sm bg-current opacity-40 mr-2"></span>
          {detail.label} • {detail.code}
        </p>
      </div>
      
      {/* Details Area - Fixed Label Widths for Vertical Alignment */}
      <div className="space-y-3 border-t border-slate-800/50 pt-5">
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-slate-600 font-black uppercase tracking-widest w-16">Latency</span>
          <p className="text-[11px] font-mono font-black text-slate-200 italic">
            {effectiveConnected ? `${status.latency.toString().padStart(3, '0')}ms` : '---ms'}
          </p>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-slate-600 font-black uppercase tracking-widest w-16">Region</span>
          <span className="text-[9px] text-slate-400 font-mono">us-east-1</span>
        </div>

        {/* Quota area with fixed height to prevent card jumping */}
        <div className="h-7 mt-2">
          {status.limitRemaining && effectiveConnected ? (
            <div className="w-full bg-blue-500/5 rounded-lg py-1.5 border border-blue-500/10 flex items-center justify-center">
              <span className="text-[8px] text-blue-400 font-black uppercase tracking-tighter">Usage: {status.limitRemaining}</span>
            </div>
          ) : (
            <div className="w-full h-[1px] bg-slate-800/30 mt-3"></div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ApiStatusCard;
