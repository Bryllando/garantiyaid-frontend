/*! @license Adapted from Shadcn Space Spinner 10 (MIT).
 * Copyright (c) 2026 Shadcn Space
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
import { useId } from 'react'

const wavePath = 'M0 36.5 C67.43 36.5 99.09 15.5 160.53 15.5 C221.98 15.5 250.54 36.5 300 36.5 '
  + 'C348.56 36.5 397.3 7 457.63 7 C517.96 7 539.66 36.5 600 36.5 '
  + 'C667.43 36.5 699.09 15.5 760.53 15.5 C821.98 15.5 850.54 36.5 900 36.5 '
  + 'C948.56 36.5 997.3 7 1057.63 7 C1117.96 7 1139.66 36.5 1200 36.5 V800 H0 Z'

export function LiquidWaveSpinner() {
  const clipId = useId()
  return (
    <svg data-slot="liquid-wave-spinner" className="size-24 sm:size-28" viewBox="140 140 220 220" aria-hidden="true">
      <defs><clipPath id={clipId}><circle cx="250" cy="250" r="107" /></clipPath></defs>
      <circle cx="250" cy="250" r="107" className="fill-info-soft stroke-line" strokeWidth="2" />
      <g clipPath={`url(#${clipId})`}>
        <g transform="translate(0 183)"><path d={wavePath} className="ga-liquid-wave fill-brand-navy opacity-90 [animation-direction:reverse]" /></g>
        <g transform="translate(0 211)"><path d={wavePath} className="ga-liquid-wave fill-blue-400 [animation-duration:3.7s]" /></g>
        <g transform="translate(0 246)"><path d={wavePath} className="ga-liquid-wave fill-brand-navy [animation-duration:3s]" /></g>
      </g>
    </svg>
  )
}
