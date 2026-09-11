import { Moon, Sun } from 'lucide-react';
import type { Theme } from '@/hooks/useTheme';

/**
 * Light/dark switch.
 *
 * Modelled on a hardware slide switch: a hairline track with a solid travelling
 * block. The block moves on a spring-ish curve while the two icons cross-fade,
 * which reads as a throw rather than a fade. The page-wide colour transition is
 * handled in CSS (`body`, `.wl-themed`) so the whole surface resolves together
 * instead of this control animating on its own.
 */
export function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`}
      onClick={onToggle}
      className="group relative flex h-7 w-[52px] shrink-0 items-center border border-line bg-surface
                 transition-colors duration-200 hover:border-line-strong"
      title={`${isDark ? 'Dark' : 'Light'} — click to switch`}
    >
      {/* Travelling block. 2px inset keeps the hairline visible on both sides. */}
      <span
        aria-hidden
        className="absolute top-[2px] h-[22px] w-[22px] bg-ink
                   transition-transform duration-300 ease-instrument
                   group-active:scale-95"
        style={{ transform: `translateX(${isDark ? 26 : 2}px)` }}
      />
      {/* Icons sit above the block and invert where it covers them. */}
      <span aria-hidden className="relative z-10 flex w-full items-center justify-between px-[7px]">
        <Sun
          size={12}
          strokeWidth={1.75}
          className={`transition-[opacity,color] duration-300 ${
            isDark ? 'text-muted opacity-50' : 'text-paper opacity-100'
          }`}
        />
        <Moon
          size={12}
          strokeWidth={1.75}
          className={`transition-[opacity,color] duration-300 ${
            isDark ? 'text-paper opacity-100' : 'text-muted opacity-50'
          }`}
        />
      </span>
    </button>
  );
}
