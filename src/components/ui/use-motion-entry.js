import { useEffect, useRef } from 'react'
import { animate, createScope } from 'animejs'

export function useMotionEntry(stateKey) {
  const target = useRef(null)

  useEffect(() => {
    const scope = createScope({
      root: target,
      mediaQueries: { reducedMotion: '(prefers-reduced-motion: reduce)' },
    }).add(({ matches }) => {
      if (matches.reducedMotion) return

      animate(target.current, {
        opacity: [0, 1],
        y: [8, 0],
        duration: 320,
        ease: 'outExpo',
      })
    })

    return () => scope.revert()
  }, [stateKey])

  return target
}
