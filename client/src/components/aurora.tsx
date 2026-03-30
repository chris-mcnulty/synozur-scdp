import { useEffect, useRef } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { cn } from "@/lib/utils";

interface AuroraProps {
  intensity?: "low" | "medium" | "high";
  theme?: "dark" | "light";
  particles?: boolean;
  className?: string;
}

export function Aurora({ intensity, theme: themeProp, particles = false, className }: AuroraProps) {
  const { theme: contextTheme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const resolvedTheme = themeProp ?? contextTheme;
  const isDark = resolvedTheme === "dark";

  const opacityMap = {
    low: isDark ? 0.06 : 0.04,
    medium: isDark ? 0.12 : 0.05,
    high: isDark ? 0.18 : 0.06,
  };
  const resolvedIntensity = intensity ?? "medium";
  const blobOpacity = opacityMap[resolvedIntensity];

  useEffect(() => {
    if (!particles || !isDark) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animFrame: number;
    let width = canvas.offsetWidth;
    let height = canvas.offsetHeight;
    canvas.width = width;
    canvas.height = height;

    const COUNT = 70;
    const stars = Array.from({ length: COUNT }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: Math.random() * 1.2 + 0.3,
      vx: (Math.random() - 0.5) * 0.15,
      vy: (Math.random() - 0.5) * 0.15,
      opacity: Math.random() * 0.18 + 0.07,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      for (const s of stars) {
        s.x += s.vx;
        s.y += s.vy;
        if (s.x < 0) s.x = width;
        if (s.x > width) s.x = 0;
        if (s.y < 0) s.y = height;
        if (s.y > height) s.y = 0;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${s.opacity})`;
        ctx.fill();
      }
      animFrame = requestAnimationFrame(draw);
    };

    draw();

    const handleResize = () => {
      width = canvas.offsetWidth;
      height = canvas.offsetHeight;
      canvas.width = width;
      canvas.height = height;
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animFrame);
      window.removeEventListener("resize", handleResize);
    };
  }, [particles, isDark]);

  return (
    <div className={cn("absolute inset-0 overflow-hidden pointer-events-none", className)} aria-hidden="true">
      {particles && isDark && (
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      )}
      <div
        className="absolute rounded-full blur-3xl animate-blob"
        style={{
          width: "60%",
          height: "60%",
          top: "-10%",
          left: "-5%",
          background: "hsl(268.98 96.72% 52.16%)",
          opacity: blobOpacity,
        }}
      />
      <div
        className="absolute rounded-full blur-3xl animate-blob animation-delay-2000"
        style={{
          width: "55%",
          height: "55%",
          top: "30%",
          right: "-10%",
          background: "hsl(314.04 90.08% 47.45%)",
          opacity: blobOpacity,
        }}
      />
      <div
        className="absolute rounded-full blur-3xl animate-blob animation-delay-4000"
        style={{
          width: "50%",
          height: "50%",
          bottom: "-10%",
          left: "20%",
          background: "hsl(268.98 96.72% 52.16%)",
          opacity: blobOpacity * 0.8,
        }}
      />
    </div>
  );
}
