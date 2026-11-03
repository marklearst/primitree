import type { IconBaseProps, IconType } from 'react-icons'
import {
  TbArrowRight,
  TbBrandGithub,
  TbCheck,
  TbCopy,
  TbMoon,
  TbRefresh,
  TbSun,
  TbX,
} from 'react-icons/tb'

export type IconProps = IconBaseProps

/** Wraps a Tabler icon from react-icons with the site's defaults: decorative,
 * 2px stroke, and aligned to the text baseline. */
function icon(Component: IconType) {
  return function Icon({ size = 18, style, ...props }: IconProps) {
    return (
      <Component
        aria-hidden='true'
        focusable='false'
        size={size}
        strokeWidth={2}
        {...props}
        style={{
          display: 'inline-block',
          flexShrink: 0,
          verticalAlign: '-0.15em',
          ...style,
        }}
      />
    )
  }
}

export const ArrowRightIcon = /* @__PURE__ */ icon(TbArrowRight)
export const GithubIcon = /* @__PURE__ */ icon(TbBrandGithub)
export const MoonIcon = /* @__PURE__ */ icon(TbMoon)
export const SunIcon = /* @__PURE__ */ icon(TbSun)
export const XIcon = /* @__PURE__ */ icon(TbX)
export const CheckIcon = /* @__PURE__ */ icon(TbCheck)
export const CopyIcon = /* @__PURE__ */ icon(TbCopy)
export const ReplayIcon = /* @__PURE__ */ icon(TbRefresh)
