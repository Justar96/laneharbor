import React from 'react';

interface LaneHarborIconProps {
  className?: string;
  size?: number;
}

export const LaneHarborIcon: React.FC<LaneHarborIconProps> = ({
  className = "",
  size = 20
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`laneharbor-icon ${className}`}
    >
      {/* Pyramid base shadow */}
      <ellipse
        cx="12"
        cy="19"
        rx="8"
        ry="2"
        fill="currentColor"
        opacity="0.2"
      />

      {/* Pyramid base */}
      <polygon
        points="4,18 20,18 16,12 8,12"
        fill="currentColor"
        opacity="0.4"
      />

      {/* Left face of pyramid */}
      <polygon
        points="4,18 12,6 8,12"
        fill="currentColor"
        opacity="0.6"
      />

      {/* Right face of pyramid */}
      <polygon
        points="20,18 12,6 16,12"
        fill="currentColor"
        opacity="0.8"
      />

      {/* Front face of pyramid */}
      <polygon
        points="8,12 16,12 12,6"
        fill="currentColor"
        opacity="0.9"
      />

      {/* Pyramid peak highlight */}
      <polygon
        points="11,8 13,8 12,6"
        fill="currentColor"
        opacity="0.3"
      />

      {/* Side edges for depth */}
      <line
        x1="4"
        y1="18"
        x2="12"
        y2="6"
        stroke="currentColor"
        strokeWidth="0.5"
        opacity="0.4"
      />
      <line
        x1="20"
        y1="18"
        x2="12"
        y2="6"
        stroke="currentColor"
        strokeWidth="0.5"
        opacity="0.4"
      />
      <line
        x1="8"
        y1="12"
        x2="12"
        y2="6"
        stroke="currentColor"
        strokeWidth="0.5"
        opacity="0.4"
      />
      <line
        x1="16"
        y1="12"
        x2="12"
        y2="6"
        stroke="currentColor"
        strokeWidth="0.5"
        opacity="0.4"
      />

      {/* Base edges */}
      <line
        x1="4"
        y1="18"
        x2="20"
        y2="18"
        stroke="currentColor"
        strokeWidth="0.5"
        opacity="0.6"
      />
      <line
        x1="8"
        y1="12"
        x2="16"
        y2="12"
        stroke="currentColor"
        strokeWidth="0.5"
        opacity="0.6"
      />
    </svg>
  );
};

// ASCII Text Version for alternative use
export const LaneHarborAsciiIcon: React.FC<{ className?: string }> = ({
  className = ""
}) => {
  return (
    <div className={`font-mono text-xs ${className}`}>
      <pre className="leading-tight">
{`   /\\
  //\\
 //  \\
||    ||
\\\\  //
 \\//
  \\/`}
      </pre>
    </div>
  );
};

// Minimal ASCII version
export const LaneHarborMinimalIcon: React.FC<{ className?: string }> = ({
  className = ""
}) => {
  return (
    <div className={`font-mono text-xs ${className}`}>
      <pre className="leading-tight">
{`[LH]`}
      </pre>
    </div>
  );
};
