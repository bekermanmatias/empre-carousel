import type { Slide } from '../schemas/templates'
import { Divider } from '../components/Divider'
import { EmpreLogo } from '../components/EmpreLogo'
import { ImageSlot } from '../components/ImageSlot'
import { OverflowText } from '../components/OverflowText'
import { SlideNumber } from '../components/SlideNumber'
export const image = (s: Slide, className?: string) => <ImageSlot className={className} imageUrl={s.image?.url} objectPosition={s.image?.objectPosition} alt={s.image?.alt} />
export const Logo = ({className}: {className?:string}) => <EmpreLogo className={className} />
export { Divider, OverflowText, SlideNumber }
