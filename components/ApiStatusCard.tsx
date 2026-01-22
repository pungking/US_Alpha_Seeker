
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
    if (!effectiveConnected) return { label: 'DISCONNECTED', code: '401 AUTH', color: 'text-red-500' };
    if (status.latency < 45) return { label: 'OPTIMAL', code: '200 OK', color: 'text-emerald-400' };
    if (status.latency < 100) return { label: 'STABLE', code: '200 OK', color: 'text-blue-400' };
    return { label: 'DEGRADED', code: '429 BUSY', color: 'text-amber-400' };
  };

  const detail = getStatusDetail();

  return (
    <div className={`glass-panel p-4 rounded-2xl flex flex-col justify-between border-t-2 shadow-xl transition-all group relative overflow-hidden ${effectiveConnected ? 'border-t-slate-700 hover:border-t-blue-500 hover:bg-slate-800/80' : 'border-t-red-900 bg-red-950/10'}`}>
      <div className={`absolute -right-2 -top-2 w-8 h-8 rounded-full opacity-10 blur-xl ${effectiveConnected ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
      
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest group-hover:text-slate-300">{status.provider}</h3>
          <p className={`text-[9px] font-bold ${detail.color} mt-0.5 animate-in fade-in duration-500`}>{detail.label} • {detail.code}</p>
        </div>
        <div className={`w-2 h-2 rounded-full ${effectiveConnected ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]' : 'bg-red-500 animate-pulse'}`}></div>
      </div>
      
      <div className="space-y-2">
        <div className="flex items-end justify-between">
          <span className="text-[9px] text-slate-600 font-bold uppercase">Latency</span>
          <p className="text-sm font-mono font-black text-slate-200">{effectiveConnected ? status.latency : '--'}ms</p>
        </div>
        
        <div className="flex items-end justify-between border-t border-slate-800/50 pt-2">
          <span className="text-[9px] text-slate-600 font-bold uppercase">Region</span>
          <span className="text-[9px] text-slate-400 font-mono">us-east-1</span>
        </div>

        {status.limitRemaining && effectiveConnected && (
          <div className="mt-2 bg-blue-500/5 rounded-lg p-1.5 border border-blue-500/10 text-center">
            <p className="text-[9px] text-blue-400 font-black uppercase tracking-tighter">Quota: {status.limitRemaining}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ApiStatusCard;
