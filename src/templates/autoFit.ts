import type { AutoFitConfig } from '../components/OverflowText'

// T06 quote box: 435×390 px. Normal text retains 43 px / 1.16; auto-fit is capped at 36 px.
export const T06_QUOTE_AUTO_FIT: AutoFitConfig = {
  defaultFontSize: 43,
  minFontSize: 36,
  step: 1,
  preserveLineHeightRatio: true,
}
