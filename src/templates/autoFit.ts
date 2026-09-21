import type { AutoFitConfig } from '../components/OverflowText'

// T06 quote box: 435×390 px. Normal text retains 43 px / 1.16; auto-fit stops at 85%.
export const T06_QUOTE_AUTO_FIT: AutoFitConfig = {
  defaultFontSize: 43,
  minFontSize: 36.55,
  step: 1,
  preserveLineHeightRatio: true,
  maxLines: 8,
}

export const TEXT_FIELD_CONFIG: Record<string,Record<string,AutoFitConfig>> = {
  T01: {
    title: {defaultFontSize:51,minFontSize:44,step:1,preserveLineHeightRatio:true,maxLines:3},
    summary: {defaultFontSize:22,minFontSize:19,step:1,preserveLineHeightRatio:true,maxLines:3},
  },
  T02: {
    title: {defaultFontSize:51,minFontSize:44,step:1,preserveLineHeightRatio:true,maxLines:3},
    body: {defaultFontSize:23,minFontSize:20,step:1,preserveLineHeightRatio:true,maxLines:6},
    highlight: {defaultFontSize:26,minFontSize:23,step:1,preserveLineHeightRatio:true,maxLines:2},
  },
  T04: {},
  T07: {},
  T03: {
    title: {defaultFontSize:51,minFontSize:44,step:1,preserveLineHeightRatio:true,maxLines:3},
    body: {defaultFontSize:23,minFontSize:20,step:1,preserveLineHeightRatio:true,maxLines:5},
  },
  T08: {},
  T06: {quote:T06_QUOTE_AUTO_FIT,context:{defaultFontSize:21,minFontSize:18,step:1,preserveLineHeightRatio:true,maxLines:3}},
  T09: {
    title: {defaultFontSize:48,minFontSize:41,step:1,preserveLineHeightRatio:true,maxLines:2},
    body: {defaultFontSize:23,minFontSize:20,step:1,preserveLineHeightRatio:true,maxLines:4},
    highlight: {defaultFontSize:23,minFontSize:20,step:1,preserveLineHeightRatio:true,maxLines:2},
  },
}

// T04/T07 and T08 use the same visual field sizes as their sibling layouts.
TEXT_FIELD_CONFIG.T04=TEXT_FIELD_CONFIG.T02
TEXT_FIELD_CONFIG.T07=TEXT_FIELD_CONFIG.T02
TEXT_FIELD_CONFIG.T08=TEXT_FIELD_CONFIG.T03

export const textConfig = (template:string,field:string) => TEXT_FIELD_CONFIG[template]?.[field]
