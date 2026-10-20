// OmniHub Atmospheric Simulation (Clouds, Rain, Snow, Sun Glint)
// Translates real regional weather data (cloud cover, precipitation, wind speed & direction)
// into moving fluid cloud masses, rain drops, and snow flakes across the 100-mile living map.
(function () {
  const Sky = {
    canvas: null,
    ctx: null,
    field: null,
    clouds: [],
    particles: [],
    windX: 1.2,
    windY: -0.4,
    lastTime: 0,
    running: false,

    init() {
      this.canvas = document.getElementById('sky-canvas');
      if (!this.canvas) return;
      this.ctx = this.canvas.getContext('2d');
      this.resize();
      window.addEventListener('resize', () => this.resize());

      // Seed cloud masses
      this.initClouds();

      // Listen for weather grid updates
      document.addEventListener('livingmap:field', (e) => {
        this.field = e.detail;
        this.updateWind();
      });

      this.running = true;
      requestAnimationFrame((t) => this.loop(t));
    },

    resize() {
      if (!this.canvas) return;
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    },

    initClouds() {
      this.clouds = [];
      const count = 35;
      const w = window.innerWidth || 1920;
      const h = window.innerHeight || 1280;

      for (let i = 0; i < count; i++) {
        this.clouds.push({
          x: Math.random() * (w + 400) - 200,
          y: Math.random() * (h + 400) - 200,
          radius: 120 + Math.random() * 220,
          opacity: 0.15 + Math.random() * 0.45,
          speedMult: 0.7 + Math.random() * 0.6,
          puffCount: 5 + Math.floor(Math.random() * 5),
          puffs: Array.from({ length: 8 }, () => ({
            dx: (Math.random() - 0.5) * 140,
            dy: (Math.random() - 0.5) * 100,
            r: 60 + Math.random() * 110
          }))
        });
      }
    },

    updateWind() {
      if (!this.field || !this.field.cells || !this.field.cells.length) return;
      // Get median or average wind
      const centerCell = this.field.cells[Math.floor(this.field.cells.length / 2)] || {};
      const speed = centerCell.wind_speed || 8;
      const dirDeg = centerCell.wind_dir || 225; // Direction wind comes FROM
      // Convert to movement vector (wind blows TOWARDS dirDeg + 180)
      const rad = ((dirDeg + 180) % 360) * (Math.PI / 180);
      const scaledSpeed = Math.max(0.6, Math.min(4.5, speed * 0.15));
      this.windX = Math.cos(rad) * scaledSpeed;
      this.windY = Math.sin(rad) * scaledSpeed;
    },

    loop(timestamp) {
      if (!this.running) return;
      if (!this.lastTime) this.lastTime = timestamp;
      const dt = Math.min(100, timestamp - this.lastTime);
      this.lastTime = timestamp;

      this.update(dt);
      this.draw();

      requestAnimationFrame((t) => this.loop(t));
    },

    update(dt) {
      const w = this.canvas.width;
      const h = this.canvas.height;
      const speedFactor = (dt / 16.6) * 0.8;

      // Update Clouds
      for (const cloud of this.clouds) {
        cloud.x += this.windX * cloud.speedMult * speedFactor;
        cloud.y += this.windY * cloud.speedMult * speedFactor;

        // Wrap around borders
        if (cloud.x > w + 300) cloud.x = -300;
        if (cloud.x < -300) cloud.x = w + 300;
        if (cloud.y > h + 300) cloud.y = -300;
        if (cloud.y < -300) cloud.y = h + 300;
      }

      // Manage rain/snow particles if precipitation exists
      const precip = window.currentWeatherData?.current?.precipitation || 0;
      const isSnow = (window.currentWeatherData?.current?.snowfall || 0) > 0 ||
                     [71, 73, 75, 77, 85, 86].includes(window.currentWeatherData?.current?.weather_code);

      if (precip > 0.01 || isSnow) {
        const targetParticles = Math.min(180, Math.floor(precip * 80) + 40);
        while (this.particles.length < targetParticles) {
          this.particles.push({
            x: Math.random() * w,
            y: Math.random() * -100,
            len: isSnow ? 3 : 16 + Math.random() * 14,
            speed: isSnow ? 1.5 + Math.random() * 2 : 12 + Math.random() * 8,
            snow: isSnow,
            size: isSnow ? 2 + Math.random() * 2.5 : 1.2
          });
        }
      } else {
        if (this.particles.length > 0) this.particles.pop();
      }

      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.x += this.windX * 0.7 * speedFactor;
        p.y += p.speed * speedFactor;
        if (p.y > h + 50 || p.x > w + 50 || p.x < -50) {
          p.y = -20;
          p.x = Math.random() * w;
        }
      }
    },

    draw() {
      const ctx = this.ctx;
      const w = this.canvas.width;
      const h = this.canvas.height;

      ctx.clearRect(0, 0, w, h);

      // Current light factor (0 = full night, 1 = midday daylight)
      const daylight = window.LivingMap?.light?.daylight ?? 1;
      const isNight = daylight < 0.25;

      // Cloud appearance: white/silver during day, deep smoky charcoal at night
      const cloudShade = Math.round(18 + daylight * 230);
      const cloudColor = `rgba(${cloudShade}, ${cloudShade}, ${cloudShade},`;

      // Render Organic Cloud Masses
      for (const cloud of this.clouds) {
        const rad = ctx.createRadialGradient(
          cloud.x, cloud.y, 10,
          cloud.x, cloud.y, cloud.radius
        );
        const baseAlpha = cloud.opacity * (0.35 + daylight * 0.5);
        rad.addColorStop(0, `${cloudColor} ${baseAlpha.toFixed(3)})`);
        rad.addColorStop(0.55, `${cloudColor} ${(baseAlpha * 0.55).toFixed(3)})`);
        rad.addColorStop(1, `${cloudColor} 0)`);

        ctx.fillStyle = rad;
        ctx.beginPath();
        ctx.arc(cloud.x, cloud.y, cloud.radius, 0, Math.PI * 2);
        ctx.fill();

        // Extra cloud puffs for realistic cumulus volume
        for (let j = 0; j < cloud.puffCount; j++) {
          const puff = cloud.puffs[j];
          const px = cloud.x + puff.dx;
          const py = cloud.y + puff.dy;
          const prad = ctx.createRadialGradient(px, py, 5, px, py, puff.r);
          prad.addColorStop(0, `${cloudColor} ${(baseAlpha * 0.45).toFixed(3)})`);
          prad.addColorStop(1, `${cloudColor} 0)`);
          ctx.fillStyle = prad;
          ctx.beginPath();
          ctx.arc(px, py, puff.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Render Rain Streaks or Snow
      if (this.particles.length > 0) {
        for (const p of this.particles) {
          if (p.snow) {
            ctx.fillStyle = `rgba(245, 245, 250, ${0.4 + daylight * 0.4})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.strokeStyle = `rgba(210, 225, 245, ${0.25 + daylight * 0.35})`;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x + this.windX * 2, p.y + p.len);
            ctx.stroke();
          }
        }
      }
    }
  };

  window.Sky = Sky;
})();
