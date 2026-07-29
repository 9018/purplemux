import type { SVGProps } from 'react';
import { cn } from '@/lib/utils';

interface IPiIconProps extends SVGProps<SVGSVGElement> {
  size?: number | string;
}

const PiIcon = ({ className, size, ...props }: IPiIconProps) => (
  <svg
    {...props}
    width={size ?? '1em'}
    height={size ?? '1em'}
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    className={cn('shrink-0', className)}
  >
    <path
      fill="currentColor"
      d="M5.25 5.25h13.5v2.1h-2.2v8.7c0 1.02.36 1.55 1.08 1.55.4 0 .78-.12 1.12-.35v2.08c-.53.28-1.13.42-1.8.42-1.7 0-2.55-1.08-2.55-3.25V7.35H9.62c-.12 3.15-.48 5.7-1.08 7.65-.62 2.03-1.6 3.62-2.94 4.78L4 18.22c1.1-.93 1.92-2.25 2.45-3.95.53-1.72.85-4.03.95-6.92H5.25v-2.1Z"
    />
  </svg>
);

export default PiIcon;
