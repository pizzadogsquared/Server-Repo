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
  plantedFlowers: {} // store per-flower images here
};

images.bee.src = "/images/bee.png";
images.background.src = "/images/background_sky.jpg";
images.tree.src = "/images/tree.png";
images.hive.src = "/images/bee_hive.png";
images.house.src = "/images/house.png";

let loadedImages = 0;
const totalImages = Object.keys(images).length - 1; // skip plantedFlowers

for (const key in images) {
  if (key === "plantedFlowers") continue;
  images[key].onload = () => {
    loadedImages++;
    if (loadedImages === totalImages) startAnimation();
  };
}

const flowerSpots = [
  { x: 100, y: canvas.height - 70 }, { x: 160, y: canvas.height - 70 },
  { x: 220, y: canvas.height - 70 }, { x: 280, y: canvas.height - 70 },
  { x: 340, y: canvas.height - 70 }, { x: 400, y: canvas.height - 70 },
  { x: 460, y: canvas.height - 70 }, { x: 520, y: canvas.height - 70 },
  { x: 580, y: canvas.height - 70 }, { x: 640, y: canvas.height - 70 },
  { x: 700, y: canvas.height - 70 }, { x: 760, y: canvas.height - 70 },
  { x: 820, y: canvas.height - 70 }, { x: 880, y: canvas.height - 70 },
  { x: 940, y: canvas.height - 70 }
];

const plantedFlowerData = Array.isArray(window.plantedFlowers) ? window.plantedFlowers : [];

plantedFlowerData.forEach(({ spot_index, image }) => {
  const img = new Image();
  img.src = image;
  images.plantedFlowers[spot_index] = img;
});

const flowerPositions = plantedFlowerData
  .map(({ spot_index }) => flowerSpots[spot_index])
  .filter(Boolean);

const hivePos = { x: canvas.width - 80, y: canvas.height - 180 };
const wellnessScores = window.wellnessScores || [];
const validScores = wellnessScores.filter(s => typeof s === "number");
const averageScore = validScores.length
  ? validScores.reduce((sum, val) => sum + val, 0) / validScores.length
  : 5;
const numBees = Math.min(10, Math.max(1, Math.floor(averageScore)));

function getRandomFlower() {
  return flowerPositions.length > 0
    ? flowerPositions[Math.floor(Math.random() * flowerPositions.length)]
    : { x: canvas.width / 2, y: canvas.height - 80 };
}

const bees = [];
for (let i = 0; i < numBees; i++) {
  bees.push({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    state: "wandering",
    speed: averageScore >= 7 ? 0.6 : averageScore >= 4 ? 0.4 : 0.25,
    target: getRandomFlower(),
    timer: 0
  });
}

function updateBee(bee) {
  const target = bee.state === "toFlower" ? bee.target : bee.state === "returning" ? hivePos : null;

  if (target) {
    const dx = target.x - bee.x;
    const dy = target.y - bee.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 5) {
      bee.state = bee.state === "toFlower" ? "pollinating" : "wandering";
      bee.timer = bee.state === "pollinating" ? 60 + Math.random() * 60 : 0;
      bee.target = bee.state === "wandering" ? getRandomFlower() : bee.target;
    } else {
      const speed = bee.speed;
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
  const flip = bee.target && bee.target.x < bee.x;
  ctx.scale(flip ? -1 : 1, 1);
  ctx.drawImage(images.bee, -12, -12, 24, 24);
  ctx.restore();
}

function drawPlantedFlowers() {
  plantedFlowerData.forEach(({ spot_index }) => {
    const spot = flowerSpots[spot_index];
    const img = images.plantedFlowers[spot_index];
    if (!spot || !img?.complete) return;

    const maxSize = 60;
    const aspectRatio = img.width / img.height || 1;
    let width = maxSize;
    let height = width / aspectRatio;
    if (height > maxSize) {
      height = maxSize;
      width = height * aspectRatio;
    }

    ctx.drawImage(img, spot.x - width / 2, spot.y - height / 2, width, height);
  });
}

function drawBackground() {
  ctx.drawImage(images.background, 0, 0, canvas.width, canvas.height);
  ctx.drawImage(images.house, 20, canvas.height - 140, 120, 120);
  const treeX = canvas.width - 170;
  ctx.drawImage(images.tree, treeX, canvas.height - 240, 150, 220);
  ctx.drawImage(images.hive, treeX + 60, canvas.height - 180, 50, 50);
  drawPlantedFlowers();
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
