import MotionRoot from '../ui/motion-root.jsx'

function AppLayout({ children }) {
  return (
    <MotionRoot key={window.location.pathname}>{children}</MotionRoot>
  )
}

export default AppLayout
