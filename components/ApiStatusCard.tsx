
import React from 'react';
import { ApiStatus, ApiProvider } from '../types';
import { API_CONFIGS } from '../constants';

interface Props {
  status: ApiStatus;
  isAuthConnected?: boolean;
  onRefresh?: () => void;
  onProbe?: () => void;
  probing?: boolean;
}

const ApiStatusCard: React.FC<Props> = ({ status, isAuthConnected, onRefresh, onProbe, probing }) => {
  const config = API_CONFIGS.find(c => c.provider === status.provider);
  const categoryLabel = config?.category === 'Acquisition' ? 'ACQ' : config?.category === 'Intelligence' ? 'INT' : 'INF';
  const categoryColor = config?.category === 'Acquisition' ? 'text-blue-400 border-blue-500/30' : config?.category === 'Intelligence' ? 'text-emerald-400 border-emerald-500/30' : 'text-amber-400 border-amber-500/30';

  const isCloudService = status.provider === ApiProvider.GOOGLE_DRIVE;
  const effectiveConnected = isCloudService ? (isAuthConnected || status.isConnected) : status.isConnected;

  const getStatusDetail = () => {
    if (!effectiveConnected) return { label: 'SETUP', code: 'REQUIRED', color: 'text-red-500', bgColor: 'bg-red-500' };
    return { label: 'CONFIG', code: 'UNVERIFIED', color: 'text-blue-400', bgColor: 'bg-blue-500' };
  };

  const detail = getStatusDetail();
  const diagnostics = status.diagnostics;
  const verified = diagnostics?.verified === true;
  const ai = status.provider === ApiProvider.GEMINI || status.provider === ApiProvider.PERPLEXITY;
  const checking = diagnostics?.state === 'CHECKING';

  return (
    <div className={`flex-shrink-0 glass-panel p-3.5 rounded-xl flex flex-col justify-between gap-2 border-t-2 shadow-lg transition-all w-[185px] md:w-[205px] min-h-[172px] ${verified ? 'border-t-emerald-500' : 'border-t-slate-700'}`}>
      <div className="flex justify-between items-start">
        <div className="flex flex-col">
          <span className={`text-[7px] font-black px-1.5 py-0.5 rounded border mb-1.5 w-fit ${categoryColor}`}>{categoryLabel}</span>
          <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-wider truncate w-[100px]">{status.provider.replace('Google ', '').replace('OpenAI ', '')}</h3>
        </div>
        <div className={`w-1.5 h-1.5 rounded-full mt-1 ${verified ? 'bg-emerald-500' : checking ? 'bg-blue-400 animate-pulse' : 'bg-amber-500'}`}></div>
      </div>
      
      <div className="flex items-end justify-between">
        <p className={`text-[9px] font-black ${verified ? 'text-emerald-400' : 'text-amber-300'} tracking-tighter uppercase`}>
          {diagnostics?.label || `${detail.label} / ${detail.code}`}
        </p>
        <span className="text-[8px] font-mono font-black text-slate-500">{diagnostics?.latency != null ? `${diagnostics.latency}ms` : '--'}</span>
      </div>
      <p className="text-[9px] text-slate-400 leading-snug min-h-[28px]" title={diagnostics?.detail}>{diagnostics?.detail || 'No provider check has completed.'}</p>
      <p className="text-[8px] font-mono text-slate-500">
        {diagnostics?.httpStatus != null ? `${diagnostics.httpSource} HTTP ${diagnostics.httpStatus} · ` : ''}
        {diagnostics?.checkedAt ? new Date(diagnostics.checkedAt).toLocaleTimeString() : 'Not checked'}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onRefresh} disabled={checking || probing} className="text-[9px] text-blue-300 underline disabled:opacity-40" aria-label={`Refresh ${status.provider} configuration`}>Refresh settings</button>
        {ai && <button type="button" onClick={onProbe} disabled={probing || checking} className="text-[9px] text-amber-300 underline disabled:opacity-40" aria-label={`Check ${status.provider} with one real request`}>{probing ? 'Checking...' : 'Test reply (may cost)'}</button>}
      </div>
    </div>
  );
};

export default ApiStatusCard;
