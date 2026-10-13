import { Scene } from './scene.js'

const root = document.documentElement
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
const finePointer = matchMedia('(pointer: fine)').matches
const clamp = (v, min, max) => Math.min(max, Math.max(min, v))
const lerp = (a, b, t) => a + (b - a) * t

const scene = new Scene(document.getElementById('webgl'))

// ---------------------------------------------------------------------------
// Text splitting — wraps chars or words in spans while preserving inner tags
// like <em>, so CSS/JS can animate each piece. Each piece gets --i for staggers.
// ---------------------------------------------------------------------------
function splitText(el, { by, className, masked = false }) {
  const pieces = []
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const nodes = []
  while (walker.nextNode()) nodes.push(walker.currentNode)

  for (const node of nodes) {
    const frag = document.createDocumentFragment()
    const tokens = by === 'chars' ? [...node.textContent] : node.textContent.split(/(\s+)/)
    for (const token of tokens) {
      if (!token) continue
      if (/^\s+$/.test(token)) {
        frag.append(token)
        continue
      }
      const span = document.createElement('span')
      span.className = className
      span.style.setProperty('--i', pieces.length)
      if (masked) {
        const inner = document.createElement('span')
        inner.textContent = token
        span.append(inner)
      } else {
        span.textContent = token
      }
      pieces.push(span)
      frag.append(span)
    }
    node.replaceWith(frag)
  }
  return pieces
}

const heroTitle = document.querySelector('.hero-title')
const heroChars = splitText(heroTitle, { by: 'chars', className: 'char' })
document.querySelectorAll('[data-split="words"]').forEach((el) => {
  splitText(el, { by: 'words', className: 'word', masked: true })
})
splitText(document.querySelector('.cta'), { by: 'chars', className: 'char' })
const statement = document.querySelector('[data-scrub]')
const scrubWords = splitText(statement, { by: 'words', className: 'scrub-word' })

// ---------------------------------------------------------------------------
// Loader — counts 0→100 (eased), waits for fonts, then wipes away
// ---------------------------------------------------------------------------
function runLoaderCount() {
  const counter = document.querySelector('.loader-count')
  return new Promise((resolve) => {
    if (reduced) return resolve()
    const start = performance.now()
    const duration = 1400
    const step = (now) => {
      const t = clamp((now - start) / duration, 0, 1)
      counter.textContent = Math.round((1 - Math.pow(1 - t, 3)) * 100)
      t < 1 ? requestAnimationFrame(step) : resolve()
    }
    requestAnimationFrame(step)
  })
}

Promise.all([runLoaderCount(), document.fonts.ready]).then(() => {
  root.classList.add('is-loaded')
  scene.reveal(reduced)
  measureMarquee()
})

// ---------------------------------------------------------------------------
// Scroll-triggered reveals & per-section blob palettes
// ---------------------------------------------------------------------------
const revealObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      entry.target.classList.add('in')
      revealObserver.unobserve(entry.target)
    }
  },
  { threshold: 0.2, rootMargin: '0px 0px -10% 0px' }
)
document.querySelectorAll('[data-reveal]').forEach((el) => revealObserver.observe(el))

// A zero-height band across the middle of the viewport: whichever section crosses it wins
const paletteObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) scene.setPalette(...entry.target.dataset.palette.split(','))
    }
  },
  { rootMargin: '-50% 0px -50% 0px' }
)
document.querySelectorAll('[data-palette]').forEach((el) => paletteObserver.observe(el))

// ---------------------------------------------------------------------------
// Hover effects: text scramble, magnetic pull, project preview + cursor badge
// ---------------------------------------------------------------------------
const GLYPHS = '!<>-_\\/[]{}=+*^?#%&'

function scramble(el) {
  const original = (el.dataset.text ??= el.textContent)
  let frame = 0
  cancelAnimationFrame(el._scrambleRaf)
  const step = () => {
    const settled = frame / 2
    el.textContent = [...original]
      .map((ch, i) => (ch === ' ' || i < settled ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0]))
      .join('')
    if (settled < original.length) {
      frame++
      el._scrambleRaf = requestAnimationFrame(step)
    }
  }
  step()
}

if (!reduced) {
  document.querySelectorAll('[data-scramble]').forEach((el) => {
    el.addEventListener('pointerenter', () => scramble(el))
  })
}

if (finePointer && !reduced) {
  document.querySelectorAll('[data-magnetic]').forEach((el) => {
    const strength = parseFloat(el.dataset.magnetic) || 0.3
    let rect
    // Measure on enter (at rest) so the element's own offset doesn't feed back into the maths
    el.addEventListener('pointerenter', () => (rect = el.getBoundingClientRect()))
    el.addEventListener('pointermove', (e) => {
      if (!rect) return
      const x = (e.clientX - (rect.left + rect.width / 2)) * strength
      const y = (e.clientY - (rect.top + rect.height / 2)) * strength
      el.style.transform = `translate(${x}px, ${y}px)`
    })
    el.addEventListener('pointerleave', () => {
      el.style.transform = ''
      rect = null
    })
  })
}

const cursor = document.querySelector('.cursor')
const preview = document.querySelector('.preview')
const previewLabel = preview.querySelector('span')

document.querySelectorAll('.work li').forEach((li) => {
  li.addEventListener('pointerenter', () => {
    preview.style.setProperty('--hue', li.dataset.hue)
    previewLabel.textContent = li.querySelector('.title').textContent
    preview.classList.add('visible')
    cursor.classList.add('view')
  })
  li.addEventListener('pointerleave', () => {
    preview.classList.remove('visible')
    cursor.classList.remove('view')
  })
})

const pointer = { x: -9999, y: -9999 }
window.addEventListener('pointermove', (e) => {
  pointer.x = e.clientX
  pointer.y = e.clientY
  cursor.classList.toggle('hovering', !!e.target.closest('a, button'))
})
window.addEventListener('pointerdown', () => scene.pulse())

// ---------------------------------------------------------------------------
// Header bits
// ---------------------------------------------------------------------------
const header = document.querySelector('.header')
const clock = document.getElementById('clock')
const tickClock = () => {
  clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
tickClock()
setInterval(tickClock, 10_000)
document.getElementById('year').textContent = new Date().getFullYear()
document.querySelector('.logo').addEventListener('click', (e) => {
  e.preventDefault()
  window.scrollTo({ top: 0, behavior: 'smooth' })
})

// ---------------------------------------------------------------------------
// Per-frame effects
// ---------------------------------------------------------------------------

// Hero letters thin out near the cursor (Syne's variable weight axis, 800 → 400)
let heroCenters = []
const heroWeights = heroChars.map(() => 800)
function measureHeroChars() {
  heroCenters = heroChars.map((c) => {
    const r = c.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 + scrollY }
  })
}
heroTitle.addEventListener('animationend', measureHeroChars)
window.addEventListener('resize', measureHeroChars)

function updateHeroWeights() {
  if (reduced || !finePointer || !heroCenters.length || scrollY > innerHeight) return
  heroChars.forEach((char, i) => {
    const c = heroCenters[i]
    const dist = Math.hypot(pointer.x - c.x, pointer.y - (c.y - scrollY))
    const target = 800 - 400 * Math.pow(clamp(1 - dist / 260, 0, 1), 2)
    const next = lerp(heroWeights[i], target, 0.15)
    if (Math.abs(next - heroWeights[i]) > 0.5) char.style.fontWeight = Math.round(next)
    heroWeights[i] = next
  })
}

// Marquee: base drift + scroll velocity, wraps seamlessly over two copies of the text
const marqueeTrack = document.querySelector('.marquee-track')
let marqueeHalf = 0
let marqueeX = 0
let marqueeSkew = 0
function measureMarquee() {
  marqueeHalf = marqueeTrack.scrollWidth / 2
}
window.addEventListener('resize', measureMarquee)

function updateMarquee(velocity, dt) {
  if (reduced || !marqueeHalf) return
  marqueeX -= (60 + velocity * 12) * dt
  if (marqueeX <= -marqueeHalf) marqueeX += marqueeHalf
  if (marqueeX > 0) marqueeX -= marqueeHalf
  marqueeSkew = lerp(marqueeSkew, clamp(velocity * -0.5, -12, 12), 0.1)
  marqueeTrack.style.transform = `translate3d(${marqueeX}px, 0, 0) skewX(${marqueeSkew}deg)`
}

// About statement: words light up one by one as the paragraph scrolls through view
function updateScrub(rect) {
  if (reduced) return
  const p = clamp((innerHeight * 0.8 - rect.top) / (rect.height + innerHeight * 0.3), 0, 1)
  const lit = p * scrubWords.length
  scrubWords.forEach((word, i) => {
    word.style.opacity = clamp(lit - i, 0.15, 1)
  })
}

const progressBar = document.querySelector('.progress')
const cursorPos = { x: -9999, y: -9999 }
const previewPos = { x: 0, y: 0 }
let previewTilt = 0
let lastPointerX = pointer.x
let smoothProgress = 0
let velocity = 0
let lastScrollY = scrollY
let lastTime = performance.now()

function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05)
  lastTime = now

  // Read layout first, then write, to avoid forcing extra reflows mid-frame
  const maxScroll = root.scrollHeight - innerHeight
  const y = scrollY
  const statementRect = statement.getBoundingClientRect()

  smoothProgress = lerp(smoothProgress, maxScroll > 0 ? y / maxScroll : 0, 0.08)
  velocity = lerp(velocity, y - lastScrollY, 0.2)
  if (Math.abs(y - lastScrollY) > 2) header.classList.toggle('hidden', y > lastScrollY && y > 200)
  lastScrollY = y

  progressBar.style.transform = `scaleX(${smoothProgress})`

  cursorPos.x = lerp(cursorPos.x, pointer.x, 0.18)
  cursorPos.y = lerp(cursorPos.y, pointer.y, 0.18)
  cursor.style.transform = `translate(${cursorPos.x}px, ${cursorPos.y}px)`

  // The preview trails the pointer and leans into horizontal movement
  const vx = pointer.x - lastPointerX
  lastPointerX = pointer.x
  previewPos.x = lerp(previewPos.x, pointer.x, 0.12)
  previewPos.y = lerp(previewPos.y, pointer.y, 0.12)
  previewTilt = lerp(previewTilt, clamp(vx * 0.8, -18, 18), 0.1)
  preview.style.transform =
    `translate(${previewPos.x}px, ${previewPos.y}px) translate(-50%, -50%) rotate(${previewTilt}deg)`

  updateHeroWeights()
  updateMarquee(velocity, dt)
  updateScrub(statementRect)
  scene.update(smoothProgress, dt, velocity)

  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
