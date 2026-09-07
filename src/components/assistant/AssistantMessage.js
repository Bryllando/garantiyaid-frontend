import { createElement, memo } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const plugins = [remarkGfm]
const allowedElements = ['p', 'br', 'strong', 'em', 'del', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'pre', 'code']
const heading = ({ children }) => createElement('h3', null, children)
const components = {
  h1: heading,
  h2: heading,
  h3: heading,
  h4: heading,
  h5: heading,
  h6: heading,
  table: ({ children }) => createElement('div', {
    className: 'ga-assistant-table', role: 'region', 'aria-label': 'Answer table', tabIndex: 0,
  }, createElement('table', null, children)),
}

// Only document formatting is rendered; generated HTML, images and interactive elements are excluded.
export default memo(function AssistantMessage({ content }) {
  return createElement('div', { className: 'ga-assistant-markdown' },
    createElement(Markdown, { remarkPlugins: plugins, components, allowedElements, unwrapDisallowed: true, skipHtml: true }, content),
  )
})
