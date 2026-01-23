
import React from 'react';
import { ApiStatus, ApiProvider } from '../types';

interface Props {
  status: ApiStatus;
  isAuthConnected?: boolean;
}

const ApiStatusCard: React.FC<Props> = ({ status, isAuthConnected }) => {
  // 실제 인증이 필요한 서비스들에 대한 상태 보정
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
    <div className={`glass-panel p-5 rounded-2xl flex flex-col justify-between border-t-2 shadow-xl transition-all group relative overflow-hidden min-h-[180px] ${effectiveConnected ? 'border-t-slate-700 hover:border-t-blue-500 hover:bg-slate-800/80' : 'border-t-red-900 bg-red-950/10'}`}>
      <div className={`absolute -right-2 -top-2 w-12 h-12 rounded-full opacity-10 blur-2xl ${detail.bgColor}`}></div>
      
      <div className="mb-4">
        <div className="flex justify-between items-start">
          <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] group-hover:text-slate-300 transition-colors">{status.provider}</h3>
          <div className={`w-2 h-2 rounded-full mt-1 ${effectiveConnected ? `${detail.bgColor} shadow-[0_0_10px_rgba(16,185,129,0.8)]` : 'bg-red-500 animate-pulse'}`}></div>
        </div>
        <p className={`text-[9px] font-black ${detail.color} mt-1 tracking-wider uppercase`}>{detail.label} • {detail.code}</p>
      </div>
      
      <div className="space-y-2.5 border-t border-slate-800/50 pt-4">
        <div className="grid grid-cols-2 items-center">
          <span className="text-[9px] text-slate-600 font-black uppercase tracking-widest">Latency</span>
          <p className="text-[11px] font-mono font-black text-slate-200 text-right italic">{effectiveConnected ? `${status.latency}ms` : '--ms'}</p>
        </div>
        
        <div className="grid grid-cols-2 items-center">
          <span className="text-[9px] text-slate-600 font-black uppercase tracking-widest">Region</span>
          <span className="text-[9px] text-slate-400 font-mono text-right">us-east-1</span>
        </div>

        {/* Quota 영역의 높이를 고정하여 줄 맞춤 유지 */}
        <div className="h-6 flex items-center justify-center">
          {status.limitRemaining && effectiveConnected ? (
            <div className="w-full bg-blue-500/5 rounded-lg py-1 border border-blue-500/10">
              <p className="text-[8px] text-blue-400 font-black uppercase tracking-tighter text-center">Quota: {status.limitRemaining}</p>
            </div>
          ) : (
            <div className="w-full h-[1px] bg-slate-800/30"></div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ApiStatusCard;
