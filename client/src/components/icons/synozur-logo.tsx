import synozurLogoColor from '../../assets/logos/SynozurLogo-color.png';
import synozurLogoWhite from '../../assets/logos/SynozurLogo-white.png';
import synozurHorizontalColor from '../../assets/logos/SA-Logo-Horizontal-color.png';
import synozurHorizontalWhite from '../../assets/logos/SA-Logo-Horizontal-white.png';

export function SynozurLogo({ className = "w-10 h-10", variant = "color" }: { className?: string; variant?: "color" | "white" }) {
  return (
    <img 
      src={variant === "white" ? synozurLogoWhite : synozurLogoColor} 
      alt="Synozur Logo" 
      className={className}
    />
  );
}

export function SynozurTextLogo({ className = "", variant = "color" }: { className?: string; variant?: "color" | "white" }) {
  return (
    <div className={`flex items-center ${className}`}>
      <img 
        src={variant === "white" ? synozurHorizontalWhite : synozurHorizontalColor} 
        alt="Synozur Alliance" 
        className="h-12"
      />
    </div>
  );
}
