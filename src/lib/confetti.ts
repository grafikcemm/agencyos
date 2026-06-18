import confetti from 'canvas-confetti'

// Task tamamlama — küçük patlama
export function fireTaskConfetti() {
  confetti({
    particleCount: 40,
    spread: 60,
    origin: { y: 0.6 },
    colors: ['#30d158', '#0099ff', '#6a4cf5', '#d44df0'],
    ticks: 80,
    gravity: 1.2,
    scalar: 0.8,
  })
}

// Günü bitir — büyük patlama
export function fireDayCompleteConfetti() {
  confetti({
    particleCount: 150,
    spread: 100,
    origin: { y: 0.5 },
    colors: ['#30d158', '#0099ff', '#6a4cf5', '#d44df0', '#ffffff'],
    ticks: 200,
    gravity: 0.9,
    scalar: 1.2,
  })

  setTimeout(() => {
    confetti({
      particleCount: 80,
      angle: 60,
      spread: 80,
      origin: { x: 0, y: 0.6 },
      colors: ['#30d158', '#0099ff'],
    })
    confetti({
      particleCount: 80,
      angle: 120,
      spread: 80,
      origin: { x: 1, y: 0.6 },
      colors: ['#30d158', '#0099ff'],
    })
  }, 200)
}
