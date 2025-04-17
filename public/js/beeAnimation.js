const canvas = document.getElementById("bee-animation-canvas");
const ctx = canvas.getContext("2d");
canvas.width = canvas.offsetWidth;
canvas.height = canvas.offsetHeight;

const images = {
  bee: new Image(),
  background: new Image(),
  tree: new Image(),
  hive: new Image(),
  house: new Image(),
  flower: new Image(),
};

images.bee.src = "/images/bee.png";
images.background.src = "/images/background_sky.jpg";
images.tree.src = "/images/tree.png";
images.hive.src = "/images/bee_hive.png";
images.house.src = "/images/house.png";
images.flower.src = "/images/flower.png";

let loadedImages = 0;
const totalImages = Object.keys(images).length;

for (const key in images) {
  images[key].onload = () => {
    loadedImages++;
    if (loadedImages === totalImages) startAnimation();
  };
  images[key].onerror = () => {
    console.error(`Failed to load ${key}: ${images[key].src}`);
  };
}

const bees = [];
const wellnessScores = window.wellnessScores || [];
const validScores = wellnessScores.filter(s => typeof s === "number");
const averageScore = validScores.length
  ? validScores.reduce((sum, val) => sum + val, 0) / validScores.length
  : 5;
const numBees = Math.min(10, Math.max(1, Math.floor(averageScore)));

const flowerPositions = [];
const flowerY = canvas.height - 90;
const spacing = 60;
const totalFlowers = 3;
const flowerWidth = 50;
const startX = (canvas.width - (flowerWidth * totalFlowers + spacing * (totalFlowers - 1))) / 2;
for (let i = 0; i < totalFlowers; i++) {
  const x = startX + i * (flowerWidth + spacing);
  flowerPositions.push({ x: x + flowerWidth / 2, y: flowerY });
}
const hivePos = { x: canvas.width - 80, y: canvas.height - 180 };

function getRandomFlower() {
  return flowerPositions[Math.floor(Math.random() * flowerPositions.length)];
}

for (let i = 0; i < numBees; i++) {
  bees.push({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    state: "wandering",
    speed: averageScore >= 7 ? 0.6 : averageScore >= 4 ? 0.4 : 0.25
    target: getRandomFlower(),
    timer: 0
  });
}

function updateBee(bee) {
  const speed = bee.speed;
  let target = bee.state === "toFlower" ? bee.target : bee.state === "returning" ? hivePos : null;

  if (target) {
    const dx = target.x - bee.x;
    const dy = target.y - bee.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 5) {
      if (bee.state === "toFlower") {
        bee.state = "pollinating";
        bee.timer = 60 + Math.random() * 60;
      } else if (bee.state === "returning") {
        bee.state = "wandering";
        bee.target = getRandomFlower();
        bee.timer = 0;
      }
    } else {
      bee.x += (dx / dist) * speed;
      bee.y += (dy / dist) * speed;
    }
  }

  if (bee.state === "pollinating") {
    bee.timer--;
    if (bee.timer <= 0) bee.state = "returning";
  }

  if (bee.state === "wandering") {
    bee.timer++;
    if (bee.timer > 100 + Math.random() * 100) {
      bee.state = "toFlower";
      bee.target = getRandomFlower();
    }
  }
}

function drawBee(bee) {
  ctx.save();
  ctx.translate(bee.x, bee.y);
  const facingLeft = bee.target ? bee.target.x < bee.x : false;
  ctx.scale(facingLeft ? -1 : 1, 1);
  ctx.drawImage(images.bee, facingLeft ? -12 : -12, -12, 24, 24);
  ctx.restore();
}

function drawBackground() {
  ctx.drawImage(images.background, 0, 0, canvas.width, canvas.height);
  ctx.drawImage(images.house, 20, canvas.height - 140, 120, 120);

  const treeWidth = 150;
  const treeX = canvas.width - treeWidth - 20;
  const treeY = canvas.height - 240;
  ctx.drawImage(images.tree, treeX, treeY, treeWidth, 220);
  ctx.drawImage(images.hive, treeX + 60, treeY + 60, 50, 50);

  for (let i = 0; i < totalFlowers; i++) {
    const x = startX + i * (flowerWidth + spacing);
    ctx.drawImage(images.flower, x, flowerY, flowerWidth, 60);
  }
}

function animateBees() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground();
  bees.forEach(bee => {
    updateBee(bee);
    drawBee(bee);
  });
  requestAnimationFrame(animateBees);
}

function startAnimation() {
  animateBees();
}

