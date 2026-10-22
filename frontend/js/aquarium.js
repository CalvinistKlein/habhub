// OmniHub Living Reef Aquarium Screensaver Engine
// Autonomous marine ecosystem: fish species, behavioral state machine, boid flocking,
// water current physics, swaying sea anemones, aerator bubbles, and interactive feeding.

(function () {
  'use strict';

  let canvas = null;
  let ctx = null;
  let animId = null;
  let isRunning = false;
  let W = 0;
  let H = 0;

  // Audio synthesizer for feeding and bubble pops
  let audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  function playSound(type) {
    try {
      const actx = getAudioCtx();
      if (!actx) return;
      const t = actx.currentTime;
      const osc = actx.createOscillator();
      const gain = actx.createGain();

      if (type === 'feed_drop') {
        // Soft water plop / drop
        osc.type = 'sine';
        osc.frequency.setValueAtTime(450, t);
        osc.frequency.exponentialRampToValueAtTime(140, t + 0.14);
        gain.gain.setValueAtTime(0.08, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
        osc.connect(gain);
        gain.connect(actx.destination);
        osc.start(t);
        osc.stop(t + 0.15);
      } else if (type === 'eat_pop') {
        // Cute bubble pop
        osc.type = 'sine';
        osc.frequency.setValueAtTime(580, t);
        osc.frequency.exponentialRampToValueAtTime(820, t + 0.08);
        gain.gain.setValueAtTime(0.06, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
        osc.connect(gain);
        gain.connect(actx.destination);
        osc.start(t);
        osc.stop(t + 0.09);
      }
    } catch (e) {}
  }

  // =========================================================================
  // AQUATIC PARTICLES: FOOD PELLETS & BUBBLES
  // =========================================================================
  const foods = [];
  const bubbles = [];
  const heartParticles = [];

  class FoodPellet {
    constructor(x, y) {
      this.x = x + (Math.random() - 0.5) * 16;
      this.y = y + (Math.random() - 0.5) * 16;
      this.vx = (Math.random() - 0.5) * 0.8;
      this.vy = 0.5 + Math.random() * 0.7; // sink speed
      this.radius = 2.8 + Math.random() * 1.5;
      this.color = Math.random() > 0.4 ? '#e88938' : '#c95b28';
      this.wobblePhase = Math.random() * Math.PI * 2;
      this.wobbleSpeed = 0.04 + Math.random() * 0.03;
      this.settled = false;
      this.age = 0;
      this.maxAge = 1800; // dissolves in ~30s if uneaten
    }

    update() {
      this.age++;
      if (!this.settled) {
        this.wobblePhase += this.wobbleSpeed;
        this.x += this.vx + Math.sin(this.wobblePhase) * 0.4;
        this.y += this.vy;
        this.vx *= 0.98;

        // Hit gravel bottom
        const bottom = H - 32;
        if (this.y >= bottom) {
          this.y = bottom;
          this.settled = true;
          this.vx = 0;
          this.vy = 0;
        }
      }
    }

    draw(ctx) {
      const alpha = this.age > this.maxAge - 120 ? (this.maxAge - this.age) / 120 : 1;
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  class Bubble {
    constructor(x, y, isAerator = false) {
      this.x = x || (Math.random() * W);
      this.y = y || (H + 10);
      this.radius = isAerator ? (1.5 + Math.random() * 3.5) : (2 + Math.random() * 4);
      this.vy = -(1.2 + Math.random() * 1.8);
      this.wobblePhase = Math.random() * Math.PI * 2;
      this.wobbleSpeed = 0.05 + Math.random() * 0.04;
      this.wobbleAmp = 0.5 + Math.random() * 0.7;
    }

    update() {
      this.wobblePhase += this.wobbleSpeed;
      this.x += Math.sin(this.wobblePhase) * this.wobbleAmp;
      this.y += this.vy;
    }

    draw(ctx) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 1;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Shiny bubble highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.beginPath();
      ctx.arc(this.x - this.radius * 0.35, this.y - this.radius * 0.35, this.radius * 0.28, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  class HeartParticle {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.vy = -1.2;
      this.alpha = 1;
      this.scale = 0.8 + Math.random() * 0.4;
    }
    update() {
      this.y += this.vy;
      this.alpha -= 0.022;
    }
    draw(ctx) {
      if (this.alpha <= 0) return;
      ctx.save();
      ctx.globalAlpha = this.alpha;
      ctx.translate(this.x, this.y);
      ctx.scale(this.scale, this.scale);
      ctx.fillStyle = '#ff4d6d';
      ctx.beginPath();
      ctx.arc(-3, -2, 3, Math.PI, 0, false);
      ctx.arc(3, -2, 3, Math.PI, 0, false);
      ctx.lineTo(0, 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // =========================================================================
  // SWAYING REEF SEAWEED & ANEMONES
  // =========================================================================
  class SeaweedStalk {
    constructor(x, baseHeight, color, numSegments = 7) {
      this.x = x;
      this.baseHeight = baseHeight;
      this.color = color;
      this.numSegments = numSegments;
      this.segLength = baseHeight / numSegments;
      this.phase = Math.random() * Math.PI * 2;
      this.speed = 0.02 + Math.random() * 0.015;
    }

    draw(ctx, time) {
      ctx.save();
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      let currX = this.x;
      let currY = H - 24;

      ctx.beginPath();
      ctx.moveTo(currX, currY);

      for (let i = 1; i <= this.numSegments; i++) {
        const sway = Math.sin(time * this.speed + this.phase + i * 0.4) * (i * 3.5);
        currX += sway * 0.25;
        currY -= this.segLength;
        ctx.lineTo(currX, currY);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  // =========================================================================
  // AUTONOMOUS FISH AGENT CLASS
  // =========================================================================
  class Fish {
    constructor(species, name, x, y) {
      this.species = species; // 'clownfish', 'blue_tang', 'yellow_tang', 'tetra', 'angelfish'
      this.name = name;
      this.x = x || (100 + Math.random() * (W - 200));
      this.y = y || (100 + Math.random() * (H - 200));
      this.vx = (Math.random() - 0.5) * 1.5;
      this.vy = (Math.random() - 0.5) * 0.8;
      this.angle = 0;
      this.targetAngle = 0;
      this.finPhase = Math.random() * Math.PI * 2;
      this.hunger = 20 + Math.random() * 30; // 0 to 100
      this.state = 'WANDER'; // 'WANDER', 'SEEK_FOOD', 'EAT', 'STARTLED'
      this.stateTimer = 0;

      // Species-specific sizing and speed characteristics
      switch (species) {
        case 'clownfish':
          this.size = 28;
          this.baseSpeed = 1.1;
          this.sprintSpeed = 2.4;
          this.bodyColor = '#ff6b1a';
          break;
        case 'blue_tang':
          this.size = 36;
          this.baseSpeed = 1.4;
          this.sprintSpeed = 3.0;
          this.bodyColor = '#195fd4';
          break;
        case 'yellow_tang':
          this.size = 32;
          this.baseSpeed = 1.2;
          this.sprintSpeed = 2.6;
          this.bodyColor = '#ffd000';
          break;
        case 'tetra':
          this.size = 16;
          this.baseSpeed = 1.6;
          this.sprintSpeed = 3.4;
          this.bodyColor = '#00f0ff';
          break;
        case 'angelfish':
          this.size = 42;
          this.baseSpeed = 0.9;
          this.sprintSpeed = 2.0;
          this.bodyColor = '#e0e4eb';
          break;
        default:
          this.size = 26;
          this.baseSpeed = 1.2;
          this.sprintSpeed = 2.5;
          this.bodyColor = '#ff8833';
      }
    }

    startle(fromX, fromY) {
      const dx = this.x - fromX;
      const dy = this.y - fromY;
      const dist = Math.hypot(dx, dy);
      if (dist < 180 && dist > 1) {
        this.state = 'STARTLED';
        this.stateTimer = 60 + Math.floor(Math.random() * 40);
        this.vx = (dx / dist) * this.sprintSpeed;
        this.vy = (dy / dist) * (this.sprintSpeed * 0.7);
      }
    }

    update(allFish) {
      // Natural hunger progression
      this.hunger = Math.min(100, this.hunger + 0.015);

      if (this.stateTimer > 0) {
        this.stateTimer--;
        if (this.stateTimer <= 0 && this.state !== 'WANDER') {
          this.state = 'WANDER';
        }
      }

      // Check for available food in water
      let targetFood = null;
      let closestDist = 450;

      if (this.state !== 'STARTLED' && this.hunger > 10 && foods.length > 0) {
        for (let i = 0; i < foods.length; i++) {
          const f = foods[i];
          const dist = Math.hypot(f.x - this.x, f.y - this.y);
          if (dist < closestDist) {
            closestDist = dist;
            targetFood = f;
          }
        }
      }

      if (targetFood) {
        this.state = 'SEEK_FOOD';
        const dx = targetFood.x - this.x;
        const dy = targetFood.y - this.y;
        const dist = Math.hypot(dx, dy);

        // Steer eagerly towards food
        this.vx += (dx / dist) * 0.12;
        this.vy += (dy / dist) * 0.10;

        // Cap to sprint speed
        const currentSpeed = Math.hypot(this.vx, this.vy);
        if (currentSpeed > this.sprintSpeed) {
          this.vx = (this.vx / currentSpeed) * this.sprintSpeed;
          this.vy = (this.vy / currentSpeed) * this.sprintSpeed;
        }

        // Catch and eat the pellet!
        if (dist < (this.size * 0.45 + targetFood.radius + 6)) {
          const idx = foods.indexOf(targetFood);
          if (idx !== -1) {
            foods.splice(idx, 1);
            this.hunger = Math.max(0, this.hunger - 40);
            this.state = 'EAT';
            this.stateTimer = 45;
            this.vx *= 0.3;
            this.vy *= 0.3;
            heartParticles.push(new HeartParticle(this.x, this.y - this.size * 0.6));
            playSound('eat_pop');
          }
        }
      } else if (this.state === 'WANDER') {
        // Natural gentle steering wander
        this.vx += (Math.random() - 0.5) * 0.14;
        this.vy += (Math.random() - 0.5) * 0.09;

        // Tetras school with other tetras (Boids)
        if (this.species === 'tetra') {
          let centerX = 0, centerY = 0, count = 0;
          let alignVx = 0, alignVy = 0;

          allFish.forEach((other) => {
            if (other !== this && other.species === 'tetra') {
              const d = Math.hypot(other.x - this.x, other.y - this.y);
              if (d < 160) {
                // Cohesion
                centerX += other.x;
                centerY += other.y;
                // Alignment
                alignVx += other.vx;
                alignVy += other.vy;
                count++;
                // Separation
                if (d < 35 && d > 0) {
                  this.vx -= (other.x - this.x) * 0.04;
                  this.vy -= (other.y - this.y) * 0.04;
                }
              }
            }
          });

          if (count > 0) {
            centerX /= count;
            centerY /= count;
            this.vx += (centerX - this.x) * 0.005;
            this.vy += (centerY - this.y) * 0.005;
            this.vx += (alignVx / count - this.vx) * 0.04;
            this.vy += (alignVy / count - this.vy) * 0.04;
          }
        }

        // Clownfish prefer staying near lower sea anemones
        if (this.species === 'clownfish' && this.y < H * 0.5) {
          this.vy += 0.02;
        }

        // Cap to base cruising speed
        const speed = Math.hypot(this.vx, this.vy);
        if (speed > this.baseSpeed) {
          this.vx = (this.vx / speed) * this.baseSpeed;
          this.vy = (this.vy / speed) * this.baseSpeed;
        }
      }

      // Smooth wall avoidance
      const margin = 80;
      if (this.x < margin) this.vx += 0.14;
      if (this.x > W - margin) this.vx -= 0.14;
      if (this.y < margin) this.vy += 0.12;
      if (this.y > H - margin - 30) this.vy -= 0.14;

      // Hard clamp bounds
      if (this.x < 15) { this.x = 15; this.vx = Math.abs(this.vx); }
      if (this.x > W - 15) { this.x = W - 15; this.vx = -Math.abs(this.vx); }
      if (this.y < 20) { this.y = 20; this.vy = Math.abs(this.vy); }
      if (this.y > H - 35) { this.y = H - 35; this.vy = -Math.abs(this.vy); }

      // Update position
      this.x += this.vx;
      this.y += this.vy;

      // Smooth heading angle
      const speed = Math.hypot(this.vx, this.vy);
      if (speed > 0.05) {
        this.targetAngle = Math.atan2(this.vy, this.vx);
        // Angle interpolation
        let diff = this.targetAngle - this.angle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        this.angle += diff * 0.12;
      }

      // Fin waggle speed proportional to current velocity
      this.finPhase += Math.max(0.08, speed * 0.16);
    }

    draw(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);

      // Facing orientation (mirror if moving left)
      const isMovingLeft = Math.cos(this.angle) < 0;
      if (isMovingLeft) {
        ctx.scale(-1, 1);
        ctx.rotate(-this.angle + Math.PI);
      } else {
        ctx.rotate(this.angle);
      }

      const s = this.size;
      const tailWiggle = Math.sin(this.finPhase) * 0.35;

      switch (this.species) {
        case 'clownfish':
          this.drawClownfish(ctx, s, tailWiggle);
          break;
        case 'blue_tang':
          this.drawBlueTang(ctx, s, tailWiggle);
          break;
        case 'yellow_tang':
          this.drawYellowTang(ctx, s, tailWiggle);
          break;
        case 'tetra':
          this.drawTetra(ctx, s, tailWiggle);
          break;
        case 'angelfish':
          this.drawAngelfish(ctx, s, tailWiggle);
          break;
        default:
          this.drawClownfish(ctx, s, tailWiggle);
      }

      ctx.restore();

      // Hungry / Happy status bubble indicator
      if (this.hunger > 75 && this.state !== 'EAT') {
        ctx.save();
        ctx.fillStyle = 'rgba(255, 180, 0, 0.85)';
        ctx.font = '10px sans-serif';
        ctx.fillText('Hungry', this.x - 16, this.y - this.size * 0.65);
        ctx.restore();
      }
    }

    // --- Species Renderers ---
    drawClownfish(ctx, s, tailWiggle) {
      // Tail Fin
      ctx.save();
      ctx.translate(-s * 0.45, 0);
      ctx.rotate(tailWiggle);
      ctx.fillStyle = '#ff6b1a';
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-s * 0.4, -s * 0.28);
      ctx.quadraticCurveTo(-s * 0.32, 0, -s * 0.4, s * 0.28);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // White tail band
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-s * 0.1, 0, s * 0.12, -Math.PI / 2, Math.PI / 2);
      ctx.fill();
      ctx.restore();

      // Dorsal Fin
      ctx.fillStyle = '#ff6b1a';
      ctx.beginPath();
      ctx.moveTo(-s * 0.2, -s * 0.22);
      ctx.quadraticCurveTo(0, -s * 0.48, s * 0.2, -s * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Main Orange Body
      ctx.fillStyle = '#ff6b1a';
      ctx.strokeStyle = '#1a1a1a';
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.52, s * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // White Vertical Bands with black outline
      ctx.fillStyle = '#ffffff';
      // Head band
      ctx.beginPath();
      ctx.ellipse(s * 0.12, 0, s * 0.09, s * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Middle band
      ctx.beginPath();
      ctx.ellipse(-s * 0.12, 0, s * 0.08, s * 0.26, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Pectoral Fin flutter
      ctx.save();
      ctx.translate(s * 0.05, s * 0.08);
      ctx.rotate(Math.sin(this.finPhase * 1.5) * 0.4);
      ctx.fillStyle = 'rgba(255, 120, 40, 0.9)';
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.18, s * 0.09, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Eye
      ctx.fillStyle = '#111111';
      ctx.beginPath();
      ctx.arc(s * 0.32, -s * 0.08, s * 0.065, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(s * 0.34, -s * 0.095, s * 0.025, 0, Math.PI * 2);
      ctx.fill();
    }

    drawBlueTang(ctx, s, tailWiggle) {
      // Yellow Tail
      ctx.save();
      ctx.translate(-s * 0.48, 0);
      ctx.rotate(tailWiggle);
      ctx.fillStyle = '#ffd000';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-s * 0.38, -s * 0.32);
      ctx.lineTo(-s * 0.3, 0);
      ctx.lineTo(-s * 0.38, s * 0.32);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Royal Blue Body
      ctx.fillStyle = '#185ad4';
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.52, s * 0.33, 0, 0, Math.PI * 2);
      ctx.fill();

      // Black Tang Patterning
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.moveTo(-s * 0.35, -s * 0.1);
      ctx.quadraticCurveTo(0, -s * 0.32, s * 0.25, -s * 0.18);
      ctx.lineTo(s * 0.1, 0);
      ctx.quadraticCurveTo(-s * 0.1, -s * 0.05, -s * 0.35, -s * 0.1);
      ctx.fill();

      // Yellow pectoral fin
      ctx.fillStyle = '#ffd000';
      ctx.beginPath();
      ctx.ellipse(s * 0.05, s * 0.08, s * 0.16, s * 0.08, 0.3, 0, Math.PI * 2);
      ctx.fill();

      // Eye
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(s * 0.34, -s * 0.07, s * 0.06, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(s * 0.35, -s * 0.085, s * 0.02, 0, Math.PI * 2);
      ctx.fill();
    }

    drawYellowTang(ctx, s, tailWiggle) {
      // Tall yellow disk body
      ctx.save();
      ctx.translate(-s * 0.46, 0);
      ctx.rotate(tailWiggle);
      ctx.fillStyle = '#ffd000';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-s * 0.35, -s * 0.25);
      ctx.lineTo(-s * 0.35, s * 0.25);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = '#ffd200';
      ctx.beginPath();
      ctx.ellipse(-s * 0.05, 0, s * 0.46, s * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();

      // White defensive scalpel spine
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-s * 0.38, -1.5, s * 0.1, 3);

      // Eye
      ctx.fillStyle = '#111111';
      ctx.beginPath();
      ctx.arc(s * 0.24, -s * 0.1, s * 0.06, 0, Math.PI * 2);
      ctx.fill();
    }

    drawTetra(ctx, s, tailWiggle) {
      // Small schooling tetra
      ctx.save();
      ctx.translate(-s * 0.45, 0);
      ctx.rotate(tailWiggle);
      ctx.fillStyle = 'rgba(255, 50, 70, 0.7)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-s * 0.35, -s * 0.2);
      ctx.lineTo(-s * 0.35, s * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Silvery streamlined base
      ctx.fillStyle = 'rgba(220, 240, 255, 0.85)';
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.5, s * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();

      // Iridescent Cyan Neon Stripe
      ctx.fillStyle = '#00f5ff';
      ctx.shadowColor = '#00f5ff';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(-s * 0.4, -s * 0.04);
      ctx.lineTo(s * 0.35, -s * 0.04);
      ctx.lineTo(s * 0.35, 0);
      ctx.lineTo(-s * 0.4, 0);
      ctx.fill();
      ctx.shadowBlur = 0; // reset

      // Red tail belly
      ctx.fillStyle = '#ff1744';
      ctx.beginPath();
      ctx.moveTo(-s * 0.4, 0);
      ctx.lineTo(0, 0);
      ctx.lineTo(-s * 0.2, s * 0.15);
      ctx.closePath();
      ctx.fill();

      // Eye
      ctx.fillStyle = '#050505';
      ctx.beginPath();
      ctx.arc(s * 0.32, -s * 0.04, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    drawAngelfish(ctx, s, tailWiggle) {
      // Tall triangular shape with sweeping long fins
      ctx.save();
      ctx.translate(-s * 0.4, 0);
      ctx.rotate(tailWiggle);
      ctx.fillStyle = 'rgba(230, 235, 245, 0.8)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-s * 0.4, -s * 0.3);
      ctx.lineTo(-s * 0.4, s * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Long dorsal fin
      ctx.fillStyle = '#dbe2ef';
      ctx.beginPath();
      ctx.moveTo(s * 0.1, -s * 0.25);
      ctx.lineTo(-s * 0.25, -s * 0.85);
      ctx.lineTo(-s * 0.1, -s * 0.2);
      ctx.closePath();
      ctx.fill();

      // Long ventral fin
      ctx.beginPath();
      ctx.moveTo(s * 0.1, s * 0.25);
      ctx.lineTo(-s * 0.25, s * 0.85);
      ctx.lineTo(-s * 0.1, s * 0.2);
      ctx.closePath();
      ctx.fill();

      // Silver body with black vertical stripes
      ctx.fillStyle = '#e8ecf2';
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.45, s * 0.38, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#222831';
      ctx.fillRect(-s * 0.1, -s * 0.35, s * 0.08, s * 0.7);
      ctx.fillRect(s * 0.1, -s * 0.3, s * 0.07, s * 0.6);

      // Eye
      ctx.fillStyle = '#ff3e3e';
      ctx.beginPath();
      ctx.arc(s * 0.28, -s * 0.08, s * 0.055, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(s * 0.28, -s * 0.08, s * 0.03, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // =========================================================================
  // AQUARIUM MANAGER
  // =========================================================================
  const allFish = [];
  const seaweedStalks = [];

  function initAquarium() {
    canvas = document.getElementById('aquarium-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);

    // Populate initial reef inhabitants
    allFish.length = 0;
    allFish.push(new Fish('clownfish', 'Marlin', W * 0.25, H * 0.65));
    allFish.push(new Fish('clownfish', 'Nemo', W * 0.32, H * 0.72));
    allFish.push(new Fish('blue_tang', 'Dory', W * 0.55, H * 0.35));
    allFish.push(new Fish('yellow_tang', 'Bubbles', W * 0.7, H * 0.5));
    allFish.push(new Fish('angelfish', 'Gill', W * 0.4, H * 0.28));

    // Neon Tetra School (6 fish)
    for (let i = 0; i < 6; i++) {
      allFish.push(new Fish('tetra', `Tetra ${i + 1}`, W * 0.6 + i * 20, H * 0.4 + (i % 3) * 15));
    }

    // Build seaweed forest
    seaweedStalks.length = 0;
    const colors = ['#1d593f', '#2a7856', '#174732', '#338f67'];
    for (let x = 60; x < W - 60; x += 110 + Math.random() * 80) {
      const h = 130 + Math.random() * 110;
      const c = colors[Math.floor(Math.random() * colors.length)];
      seaweedStalks.push(new SeaweedStalk(x, h, c));
    }

    // Setup interactive tap-to-feed & touch listeners
    setupInteraction();
  }

  function resize() {
    if (!canvas) return;
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  let lastTapTime = 0;

  function setupInteraction() {
    if (!canvas) return;

    // Tap/Click to feed fish
    canvas.addEventListener('pointerdown', (e) => {
      const now = Date.now();
      const rect = canvas.getBoundingClientRect();
      const touchX = e.clientX - rect.left;
      const touchY = e.clientY - rect.top;

      // Double-tap to wake screensaver
      if (now - lastTapTime < 350) {
        if (typeof window.wakeFromScreensaver === 'function') {
          window.wakeFromScreensaver();
          return;
        }
      }
      lastTapTime = now;

      // Drop food pellets at tap point
      feedFish(touchX, touchY);

      // Startle fish that are very close to the tap
      allFish.forEach((f) => f.startle(touchX, touchY));
    });
  }

  function feedFish(x, y) {
    // Drop 3-4 food flakes
    const count = 3 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
      foods.push(new FoodPellet(x, y));
    }
    playSound('feed_drop');

    // Spawn subtle water ripple
    const hint = document.getElementById('aquarium-feed-hint');
    if (hint) {
      hint.classList.add('feeding');
      setTimeout(() => hint.classList.remove('feeding'), 1200);
    }
  }

  // =========================================================================
  // MAIN ANIMATION LOOP
  // =========================================================================
  let frameCount = 0;

  function render(timestamp) {
    if (!isRunning) return;
    frameCount++;

    ctx.clearRect(0, 0, W, H);

    // 1. Water Ambient Gradient (Deep Oceanic Turquoise)
    const waterGrad = ctx.createLinearGradient(0, 0, 0, H);
    waterGrad.addColorStop(0, '#041726');
    waterGrad.addColorStop(0.5, '#072b42');
    waterGrad.addColorStop(1, '#051e2e');
    ctx.fillStyle = waterGrad;
    ctx.fillRect(0, 0, W, H);

    // 2. Sunlight Caustic Light Ribbons
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 4; i++) {
      const offset = (timestamp * 0.0006 + i * 1.5) % (Math.PI * 2);
      ctx.beginPath();
      ctx.moveTo(W * (0.15 + i * 0.22) + Math.sin(offset) * 45, 0);
      ctx.lineTo(W * (0.28 + i * 0.22) + Math.cos(offset) * 65, H * 0.65);
      ctx.lineTo(W * (0.22 + i * 0.22) + Math.cos(offset) * 65, H * 0.65);
      ctx.lineTo(W * (0.10 + i * 0.22) + Math.sin(offset) * 45, 0);
      ctx.fill();
    }
    ctx.restore();

    // 3. Swaying Seaweed in the Background
    const timeSec = timestamp * 0.001;
    seaweedStalks.forEach((stalk) => stalk.draw(ctx, timeSec));

    // 4. Aerator Bubbles from Corner (Air Stone)
    if (frameCount % 6 === 0) {
      bubbles.push(new Bubble(W * 0.88 + (Math.random() - 0.5) * 18, H - 28, true));
    }
    // Ambient stray bubbles
    if (frameCount % 45 === 0) {
      bubbles.push(new Bubble());
    }

    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      b.update();
      b.draw(ctx);
      if (b.y < -10) bubbles.splice(i, 1);
    }

    // 5. Food Pellets
    for (let i = foods.length - 1; i >= 0; i--) {
      const f = foods[i];
      f.update();
      f.draw(ctx);
      if (f.age > f.maxAge) foods.splice(i, 1);
    }

    // 6. Autonomous Fish
    allFish.forEach((fish) => {
      fish.update(allFish);
      fish.draw(ctx);
    });

    // 7. Heart Particles
    for (let i = heartParticles.length - 1; i >= 0; i--) {
      const hp = heartParticles[i];
      hp.update();
      hp.draw(ctx);
      if (hp.alpha <= 0) heartParticles.splice(i, 1);
    }

    // 8. Gravel Bottom & Rock Reef
    const sandGrad = ctx.createLinearGradient(0, H - 32, 0, H);
    sandGrad.addColorStop(0, '#2c251e');
    sandGrad.addColorStop(1, '#15120e');
    ctx.fillStyle = sandGrad;
    ctx.beginPath();
    ctx.moveTo(0, H - 28);
    ctx.quadraticCurveTo(W * 0.25, H - 35, W * 0.5, H - 26);
    ctx.quadraticCurveTo(W * 0.75, H - 20, W, H - 30);
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();

    // Air Stone Unit in bottom right
    ctx.fillStyle = '#44403c';
    ctx.beginPath();
    ctx.ellipse(W * 0.88, H - 26, 18, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    animId = requestAnimationFrame(render);
  }

  function start() {
    if (isRunning) return;
    isRunning = true;
    if (!canvas) initAquarium();
    resize();
    animId = requestAnimationFrame(render);
  }

  function stop() {
    isRunning = false;
    if (animId) {
      cancelAnimationFrame(animId);
      animId = null;
    }
  }

  // Expose Global Aquarium Interface
  window.Aquarium = {
    init: initAquarium,
    start: start,
    stop: stop,
    feed: (x, y) => feedFish(x || W / 2, y || 80),
    getFishCount: () => allFish.length
  };

})();
