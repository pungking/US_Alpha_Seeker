
import React from 'react';
import { ApiStatus, ApiProvider } from '../types';
import { API_CONFIGS } from '../constants';

interface Props {
  status: ApiStatus;
  isAuthConnected?: boolean;
}

const ApiStatusCard: React.FC<Props> = ({ status, isAuthConnected }) => {
  const config = API_CONFIGS.find(c => c.provider === status.provider);
  const categoryLabel = config?.category === 'Acquisition' ? 'ACQ' : config?.category === 'Intelligence' ? 'INT' : 'INF';
  const categoryColor = config?.category === 'Acquisition' ? 'text-blue-400 border-blue-500/30' : config?.category === 'Intelligence' ? 'text-emerald-400 border-emerald-500/30' : 'text-amber-400 border-amber-500/30';

  const isCloudService = status.provider === ApiProvider.GOOGLE_DRIVE || status.provider === ApiProvider.GEMINI;
  const effectiveConnected = isCloudService ? (isAuthConnected || status.isConnected) : status.isConnected;

  const getStatusDetail = () => {
    if (!effectiveConnected) return { label: 'OFF', code: '401', color: 'text-red-500', bgColor: 'bg-red-500' };
    if (status.latency > 0 && status.latency < 50) return { label: 'OPT', code: '200', color: 'text-emerald-400', bgColor: 'bg-emerald-500' };
    return { label: 'OK', code: '200', color: 'text-blue-400', bgColor: 'bg-blue-500' };
  };

  const detail = getStatusDetail();

  return (
    <div className={`flex-shrink-0 glass-panel p-3.5 rounded-xl flex flex-col justify-between border-t-2 shadow-lg transition-all w-[140px] md:w-[155px] h-[100px] ${effectiveConnected ? 'border-t-slate-700 hover:border-t-blue-500' : 'border-t-red-900 bg-red-950/5'}`}>
      <div className="flex justify-between items-start">
        <div className="flex flex-col">
          <span className={`text-[7px] font-black px-1.5 py-0.5 rounded border mb-1.5 w-fit ${categoryColor}`}>{categoryLabel}</span>
          <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-wider truncate w-[100px]">{status.provider.replace('Google ', '').replace('OpenAI ', '')}</h3>
        </div>
        <div className={`w-1.5 h-1.5 rounded-full mt-1 ${effectiveConnected ? detail.bgColor : 'bg-red-500 animate-pulse'}`}></div>
      </div>
      
      <div className="flex items-end justify-between">
        <p className={`text-[9px] font-black ${detail.color} tracking-tighter uppercase`}>
          {detail.label} • {detail.code}
        </p>
        <span className="text-[8px] font-mono font-black text-slate-500">{effectiveConnected ? `${status.latency}ms` : '--'}</span>
      </div>
    </div>
  );
};

export default ApiStatusCard;
