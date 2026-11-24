"use client"

import React from "react"
import { VoxelArc } from "@/components/ui/voxel-arc"

export function FrontBackground() {
  return (
    <div
      className="fixed inset-0 z-0 pointer-events-none select-none overflow-hidden bg-[#03010A]"
      aria-hidden="true"
    >
      <VoxelArc intensity={0.5} />
      {/* ─── CSS Keyframe Animations for Fluid GPU-Accelerated Background Motion ─── */}
      <style>{`
        @keyframes bg-orb-gold {
          0%, 100% {
            transform: translate3d(0, 0, 0) scale(1);
          }
          33% {
            transform: translate3d(60px, -40px, 0) scale(1.12);
          }
          66% {
            transform: translate3d(-30px, 50px, 0) scale(0.92);
          }
        }

        @keyframes bg-orb-blue {
          0%, 100% {
            transform: translate3d(0, 0, 0) scale(1);
          }
          33% {
            transform: translate3d(-50px, 60px, 0) scale(1.15);
          }
          66% {
            transform: translate3d(40px, -30px, 0) scale(0.9);
          }
        }

        @keyframes bg-orb-purple {
          0%, 100% {
            transform: translate3d(0, 0, 0) scale(1);
          }
          50% {
            transform: translate3d(30px, 40px, 0) scale(1.1);
          }
        }

        @keyframes bg-beam-drift {
          0% {
            transform: translate3d(-15%, -10%, 0) rotate(-6deg);
            opacity: 0.12;
          }
          50% {
            transform: translate3d(15%, 8%, 0) rotate(4deg);
            opacity: 0.22;
          }
          100% {
            transform: translate3d(-15%, -10%, 0) rotate(-6deg);
            opacity: 0.12;
          }
        }

        @keyframes bg-particle-drift-1 {
          0%, 100% { transform: translate3d(0, 0, 0); opacity: 0.25; }
          50% { transform: translate3d(-20px, -35px, 0); opacity: 0.75; }
        }

        @keyframes bg-particle-drift-2 {
          0%, 100% { transform: translate3d(0, 0, 0); opacity: 0.3; }
          50% { transform: translate3d(25px, -45px, 0); opacity: 0.85; }
        }

        @keyframes bg-particle-drift-3 {
          0%, 100% { transform: translate3d(0, 0, 0); opacity: 0.2; }
          50% { transform: translate3d(-35px, 30px, 0); opacity: 0.65; }
        }

        @keyframes bg-grid-pulse {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 0.6; }
        }

        @media (prefers-reduced-motion: reduce) {
          .bg-motion-elem {
            animation: none !important;
            transform: none !important;
          }
        }
      `}</style>

      {/* ─── Ambient Glowing Aura Orbs (Pure CSS fluid drift) ─── */}
      {/* Orb 1: Warm Cyreax Gold Glow (Top-Right) */}
      <div
        className="bg-motion-elem absolute -top-[15%] -right-[10%] w-[650px] h-[650px] sm:w-[850px] sm:h-[850px] rounded-full blur-[130px] opacity-70 pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(229,169,60,0.14) 0%, rgba(229,169,60,0.03) 55%, transparent 75%)",
          animation: "bg-orb-gold 22s ease-in-out infinite",
          willChange: "transform",
        }}
      />

      {/* Orb 2: Electric Cyan/Blue Aura (Center-Left) */}
      <div
        className="bg-motion-elem absolute top-[28%] -left-[12%] w-[600px] h-[600px] sm:w-[800px] sm:h-[800px] rounded-full blur-[140px] opacity-60 pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(42,171,238,0.12) 0%, rgba(42,171,238,0.02) 55%, transparent 75%)",
          animation: "bg-orb-blue 28s ease-in-out infinite",
          willChange: "transform",
        }}
      />

      {/* Orb 3: Subtle Violet/Indigo Aura (Bottom-Right) */}
      <div
        className="bg-motion-elem absolute top-[65%] -right-[8%] w-[550px] h-[550px] sm:w-[750px] sm:h-[750px] rounded-full blur-[140px] opacity-50 pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(139,92,246,0.09) 0%, rgba(139,92,246,0.015) 55%, transparent 75%)",
          animation: "bg-orb-purple 25s ease-in-out infinite",
          willChange: "transform",
        }}
      />

      {/* ─── Dynamic Moving Shimmer Light Beam ─── */}
      <div
        className="bg-motion-elem absolute top-0 left-1/2 -translate-x-1/2 w-[120vw] h-[60vh] pointer-events-none blur-[90px]"
        style={{
          background: "radial-gradient(ellipse 65% 35% at 50% 0%, rgba(229,169,60,0.09), rgba(42,171,238,0.04) 50%, transparent 80%)",
          animation: "bg-beam-drift 18s ease-in-out infinite",
          willChange: "transform, opacity",
        }}
      />

      {/* ─── Subtle Geometric Tech Grid (Fade-masked) ─── */}
      <div
        className="bg-motion-elem absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(255, 255, 255, 0.022) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.022) 1px, transparent 1px)
          `,
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(ellipse 85% 65% at 50% 25%, black 40%, transparent 95%)",
          WebkitMaskImage: "radial-gradient(ellipse 85% 65% at 50% 25%, black 40%, transparent 95%)",
          animation: "bg-grid-pulse 10s ease-in-out infinite",
        }}
      />

      {/* ─── Floating Stardust Particles (Micro light points) ─── */}
      <div
        className="bg-motion-elem absolute top-[18%] left-[22%] w-1.5 h-1.5 rounded-full bg-[#f7d382] blur-[0.5px] shadow-[0_0_8px_#f7d382]"
        style={{ animation: "bg-particle-drift-1 9s ease-in-out infinite" }}
      />
      <div
        className="bg-motion-elem absolute top-[36%] right-[28%] w-1.5 h-1.5 rounded-full bg-[#2AABEE] blur-[0.5px] shadow-[0_0_8px_#2AABEE]"
        style={{ animation: "bg-particle-drift-2 12s ease-in-out infinite 2s" }}
      />
      <div
        className="bg-motion-elem absolute top-[58%] left-[35%] w-1 h-1 rounded-full bg-[#e5a93c] blur-[0.5px] shadow-[0_0_6px_#e5a93c]"
        style={{ animation: "bg-particle-drift-3 10s ease-in-out infinite 4s" }}
      />
      <div
        className="bg-motion-elem absolute top-[75%] right-[18%] w-1.5 h-1.5 rounded-full bg-[#38bdf8] blur-[0.5px] shadow-[0_0_8px_#38bdf8]"
        style={{ animation: "bg-particle-drift-1 14s ease-in-out infinite 1s" }}
      />

      {/* ─── Vignette Edge Shading ─── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(circle at 50% 50%, transparent 50%, rgba(3,1,10,0.65) 100%)",
        }}
      />
    </div>
  )
}

export default FrontBackground
