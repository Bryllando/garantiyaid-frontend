import { useEffect, useRef } from 'react'
import { animate, createScope, onScroll, stagger } from 'animejs'

function MotionRoot({ children }) {
  const root = useRef(null)

  useEffect(() => {
    const scope = createScope({
      root,
      mediaQueries: { reducedMotion: '(prefers-reduced-motion: reduce)' },
    }).add(({ matches }) => {
      if (matches.reducedMotion) return

      animate('[data-motion-page]', {
        opacity: [0, 1],
        y: [8, 0],
        duration: 360,
        ease: 'outExpo',
      })

      root.current.querySelectorAll('[data-motion-reveal]').forEach((target) => {
        animate(target, {
          opacity: [0, 1],
          y: [12, 0],
          duration: 400,
          ease: 'outExpo',
          autoplay: onScroll({ target, enter: 'bottom-=72 top' }),
        })
      })

      root.current.querySelectorAll('[data-motion-stagger]').forEach((group) => {
        animate(group.children, {
          opacity: [0, 1],
          y: [10, 0],
          delay: stagger(35),
          duration: 380,
          ease: 'outExpo',
          autoplay: onScroll({ target: group, enter: 'bottom-=72 top' }),
        })
      })
    })

    return () => scope.revert()
  }, [])

  return <div ref={root} className="min-h-screen bg-page text-ink">{children}</div>
}

export default MotionRoot
