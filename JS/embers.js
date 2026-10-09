// légères particules d'embrasement qui remontent — commun à toutes les pages
(function(){
  const canvas = document.getElementById('embers');
  if(!canvas) return;

  // Animation désactivée si l'utilisateur préfère moins de mouvement.
  if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const ctx = canvas.getContext('2d');
  let w, h, dpr;

  const COLORS = ['200,60,50', '224,90,40', '160,40,40'];
  const SPRITE_SIZE = 64; // taille fixe des sprites pré-rendus (évite createRadialGradient à chaque frame)
  const sprites = COLORS.map(color => {
    const s = document.createElement('canvas');
    s.width = SPRITE_SIZE; s.height = SPRITE_SIZE;
    const sctx = s.getContext('2d');
    const grad = sctx.createRadialGradient(SPRITE_SIZE/2, SPRITE_SIZE/2, 0, SPRITE_SIZE/2, SPRITE_SIZE/2, SPRITE_SIZE/2);
    grad.addColorStop(0, `rgba(${color},1)`);
    grad.addColorStop(1, `rgba(${color},0)`);
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
    return s;
  });

  function resize(){
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth; h = window.innerHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 150);
  });
  resize();

  const COUNT = window.innerWidth < 700 ? 10 : 18;
  const particles = [];

  function spawn(p){
    p.x = Math.random() * w;
    p.y = h + Math.random() * 60;
    p.r = 0.6 + Math.random() * 1.4;
    p.speed = 0.25 + Math.random() * 0.55;
    p.drift = (Math.random() - 0.5) * 0.4;
    p.wobble = Math.random() * Math.PI * 2;
    p.wobbleSpeed = 0.01 + Math.random() * 0.02;
    p.life = 0;
    p.maxLife = h / p.speed * (0.85 + Math.random() * 0.3);
    p.spriteIndex = Math.floor(Math.random() * sprites.length);
    p.baseAlpha = 0.16 + Math.random() * 0.22;
  }

  for(let i=0;i<COUNT;i++){
    const p = {};
    spawn(p);
    p.y = Math.random() * h;
    p.life = Math.random() * p.maxLife;
    particles.push(p);
  }

  let running = true;
  document.addEventListener('visibilitychange', () => {
    const relance = !running && !document.hidden; // évite de lancer deux boucles d'animation en parallèle
    running = !document.hidden;
    if(relance) requestAnimationFrame(draw);
  });

  function draw(){
    if(!running) return;
    ctx.clearRect(0,0,w,h);
    for(const p of particles){
      p.life += 1;
      p.wobble += p.wobbleSpeed;
      p.y -= p.speed;
      p.x += p.drift + Math.sin(p.wobble) * 0.3;

      const lifeRatio = p.life / p.maxLife;
      let alpha = p.baseAlpha;
      if(lifeRatio < 0.12) alpha *= lifeRatio / 0.12;
      else if(lifeRatio > 0.75) alpha *= Math.max(0, 1 - (lifeRatio - 0.75) / 0.25);

      if(p.y < -20 || p.life >= p.maxLife){
        spawn(p);
        continue;
      }

      const glowSize = p.r * 10;
      ctx.globalAlpha = alpha;
      ctx.drawImage(sprites[p.spriteIndex], p.x - glowSize/2, p.y - glowSize/2, glowSize, glowSize);

      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgb(255,220,190)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(draw);
  }
  draw();
})();
