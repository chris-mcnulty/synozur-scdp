import synozurLogo from '@assets/SynozurLogo_color 1400_1758346891058.png';

export function SynozurLogo({ className = "w-10 h-10" }: { className?: string }) {
  return (
    <img 
      src={synozurLogo} 
      alt="Synozur Logo" 
      className={className}
    />
  );
}

import synozurHorizontalLogo from '@assets/SA-Logo-Horizontal-color_1756666632657.png';

export function SynozurTextLogo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center ${className}`}>
      <img 
        src={synozurHorizontalLogo} 
        alt="Synozur Alliance" 
        className="h-12"
      />
    </div>
  );
}
