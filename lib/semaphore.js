module.exports = class Semaphore {
  constructor(limit) {
    this.limit = limit
    this.active = 0
    this.waiting = []
  }

  wait() {
    if (this.active < this.limit) {
      this.active++
      return Promise.resolve()
    }

    return new Promise((resolve) => this.waiting.push(resolve))
  }

  signal() {
    const next = this.waiting.shift()

    if (next === undefined) this.active--
    else next()
  }
}
