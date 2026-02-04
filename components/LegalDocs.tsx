
import React, { useState } from 'react';

interface Props {
  onClose: () => void;
}

const LegalDocs: React.FC<Props> = ({ onClose }) => {
  const [tab, setTab] = useState<'privacy' | 'terms'>('privacy');

  return (
    <div className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4 md:p-10 animate-in fade-in duration-300">
      <div className="glass-panel w-full max-w-5xl h-[90vh] flex flex-col rounded-[40px] border border-white/10 shadow-2xl overflow-hidden relative">
        
        {/* Header */}
        <div className="p-6 md:p-8 border-b border-white/10 flex justify-between items-center bg-white/5 shrink-0">
          <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
            <h2 className="text-2xl md:text-3xl font-black text-white italic uppercase tracking-tighter leading-none">
              Legal Documents
            </h2>
            <div className="flex bg-black/40 p-1.5 rounded-2xl border border-white/10 w-fit">
              <button 
                onClick={() => setTab('privacy')}
                className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${tab === 'privacy' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
              >
                Privacy Policy
              </button>
              <button 
                onClick={() => setTab('terms')}
                className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${tab === 'terms' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
              >
                Terms of Service
              </button>
            </div>
          </div>
          <button onClick={onClose} className="p-3 bg-white/5 hover:bg-rose-500/20 rounded-full transition-all text-slate-400 hover:text-rose-400 border border-transparent hover:border-rose-500/30 group">
            <svg className="w-6 h-6 group-hover:rotate-90 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 md:p-12 bg-slate-950/50 custom-scrollbar">
          <div className="prose-report max-w-4xl mx-auto">
            {tab === 'privacy' ? (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div>
                    <h1>Privacy Policy</h1>
                    <p className="text-slate-500 text-[10px] uppercase tracking-widest font-mono border-b border-white/5 pb-4">Effective Date: {new Date().toLocaleDateString()}</p>
                </div>
                
                <section>
                    <h3>1. Introduction</h3>
                    <p>Welcome to <strong>US_Alpha_Seeker</strong> ("we," "our," or "us"). We are committed to protecting your personal information and your right to privacy. This Privacy Policy explains what information we collect, how we use it, and your rights in relation to it when you use our web application.</p>
                </section>

                <section>
                    <h3>2. Information We Collect</h3>
                    <p>We collect minimal data necessary to provide our financial simulation and analysis services.</p>
                    <ul>
                        <li><strong>Google User Data (OAuth):</strong> We access your Google Drive solely to read and write application-specific JSON files (e.g., `STAGE0_MASTER_UNIVERSE.json`) created by this application. We <strong>do not</strong> scan, read, or access any other files in your Google Drive.</li>
                        <li><strong>Authentication Data:</strong> We use Google OAuth 2.0 for secure authentication. We store your Access Token locally in your browser's session storage. We do not store passwords.</li>
                        <li><strong>Usage Data:</strong> We may collect anonymous usage statistics (e.g., API token usage counts) to optimize performance, stored locally.</li>
                    </ul>
                </section>

                <section>
                    <h3>3. How We Use Your Information</h3>
                    <p>Your information is used for the following purposes:</p>
                    <ul>
                        <li><strong>Service Provision:</strong> To authenticate you and persist your analysis progress (saving state to your Google Drive).</li>
                        <li><strong>AI Analysis:</strong> To generate financial insights using LLMs (Google Gemini / Perplexity). <em>Note: Only public stock tickers and market data are sent to AI providers. No personal PII is transmitted.</em></li>
                    </ul>
                </section>

                <section>
                    <h3>4. Data Sharing and Storage</h3>
                    <p>We <strong>do not</strong> sell, trade, rent, or transfer your personally identifiable information to third parties. Your data remains your property, stored in your personal Google Drive and your browser's local storage.</p>
                </section>

                <section>
                    <h3>5. Data Security</h3>
                    <p>We implement a variety of security measures to maintain the safety of your personal information. All communication with Google APIs and AI services is encrypted via SSL/TLS.</p>
                </section>

                <section>
                    <h3>6. Contact Us</h3>
                    <p>If you have any questions about this Privacy Policy, please contact us at: <strong>InnocentBae@gmail.com</strong></p>
                </section>
              </div>
            ) : (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div>
                    <h1>Terms of Service</h1>
                    <p className="text-slate-500 text-[10px] uppercase tracking-widest font-mono border-b border-white/5 pb-4">Effective Date: {new Date().toLocaleDateString()}</p>
                </div>

                <section>
                    <h3>1. Acceptance of Terms</h3>
                    <p>By accessing and using <strong>US_Alpha_Seeker</strong>, you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by these terms, please do not use this service.</p>
                </section>

                <section className="bg-rose-900/10 border-l-4 border-rose-500 p-6 rounded-r-xl">
                    <h3 className="text-rose-400 mt-0">2. Financial Disclaimer (Critical)</h3>
                    <p className="text-slate-300 font-bold">
                        US_Alpha_Seeker is a <strong>SIMULATION, EDUCATIONAL, and RESEARCH tool</strong>. It does NOT constitute financial advice, investment recommendation, or an offer to sell or buy any securities.
                    </p>
                    <p className="text-slate-400 mb-0">
                        The "Alpha" scores, predictions, AI verdicts, and reports generated by this application are theoretical and for informational purposes only. We are not responsible for any financial losses, damages, or missed opportunities resulting from the use of this software. Trade at your own risk.
                    </p>
                </section>

                <section>
                    <h3>3. Google Drive Access</h3>
                    <p>This application requires access to your Google Drive to function (specifically, to save your analysis checkpoints). By using the app, you grant permission for US_Alpha_Seeker to create, view, and manage specific files created by this app in your Google Drive.</p>
                </section>

                <section>
                    <h3>4. User Conduct</h3>
                    <p>You agree not to use the application for any unlawful purpose or any purpose prohibited under this clause. You agree not to use the application in any way that could damage the application, the services, or the general business of US_Alpha_Seeker.</p>
                </section>

                <section>
                    <h3>5. Limitation of Liability</h3>
                    <p>In no event shall US_Alpha_Seeker or its developers be liable for any damages (including, without limitation, damages for loss of data or profit, or due to business interruption) arising out of the use or inability to use the materials on US_Alpha_Seeker.</p>
                </section>

                <section>
                    <h3>6. Modifications</h3>
                    <p>We reserve the right to modify these terms at any time. Your continued use of the application after any such changes constitutes your acceptance of the new Terms of Service.</p>
                </section>
              </div>
            )}
          </div>
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-black/40 text-center flex justify-center items-center gap-2">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
            <p className="text-[9px] text-slate-500 uppercase tracking-widest font-mono">US_Alpha_Seeker Compliance • Bae Sang Min • 2026</p>
        </div>

      </div>
    </div>
  );
};

export default LegalDocs;
