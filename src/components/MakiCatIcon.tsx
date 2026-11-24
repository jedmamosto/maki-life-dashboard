import type { SVGProps } from "react";

export function MakiCatIcon({
  className = "h-6 w-6",
  ...props
}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
      {...props}
    >
      {/* Left & Right Ears */}
      <path
        d="M14 28L11 10C10.6 7.8 12.9 6.2 14.9 7.3L27 14"
        fill="#E87A2E"
        stroke="#B3480F"
        strokeWidth="2.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M50 28L53 10C53.4 7.8 51.1 6.2 49.1 7.3L37 14"
        fill="#E87A2E"
        stroke="#B3480F"
        strokeWidth="2.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Coral Inner Ears */}
      <path d="M16.5 23L15 12.5L23.5 17.2Z" fill="#F6ACA5" />
      <path d="M47.5 23L49 12.5L40.5 17.2Z" fill="#F6ACA5" />

      {/* Head */}
      <path
        d="M11 35C11 21.5 20.4 13 32 13C43.6 13 53 21.5 53 35C53 47.5 43.8 55 32 55C20.2 55 11 47.5 11 35Z"
        fill="#E87A2E"
        stroke="#B3480F"
        strokeWidth="2.75"
      />

      {/* Russet Forehead 'M' Tabby Stripes */}
      <path
        d="M23 21.5L26 26.5L32 20L38 26.5L41 21.5"
        stroke="#8F390A"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M32 14V19"
        stroke="#8F390A"
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* Cheek Tabby Stripes */}
      <path
        d="M13.5 34H18.5M14.5 39H19"
        stroke="#8F390A"
        strokeWidth="2.25"
        strokeLinecap="round"
      />
      <path
        d="M50.5 34H45.5M49.5 39H45"
        stroke="#8F390A"
        strokeWidth="2.25"
        strokeLinecap="round"
      />

      {/* Cream Muzzle */}
      <ellipse cx="32" cy="43.5" rx="11.5" ry="8.5" fill="#FFFDF9" />

      {/* Dark Espresso Eyes */}
      <circle cx="22.5" cy="34" r="3" fill="#241914" />
      <circle cx="41.5" cy="34" r="3" fill="#241914" />
      <circle cx="23.5" cy="33" r="1" fill="#FFFDF9" />
      <circle cx="42.5" cy="33" r="1" fill="#FFFDF9" />

      {/* Coral-Pink Nose */}
      <path d="M29 39.5H35L32 43L29 39.5Z" fill="#F28B82" />

      {/* Mouth */}
      <path
        d="M32 43V45.5M32 45.5C30.5 47 28.5 47 27.5 45.8M32 45.5C33.5 47 35.5 47 36.5 45.8"
        stroke="#B3480F"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
