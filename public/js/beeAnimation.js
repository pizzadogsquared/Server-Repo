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
  plantedFlowers: {}
};

images.bee.src = "/images/bee.png";
images.background.src = "/images/background_sky.jpg";
images.tree.src = "/images/tree.png";
images.hive.src = "/images/bee_hive.png";
images.house.src = "/images/house.png";

let loadedImages = 0;
const totalImages = Object.keys(images).length - 1;

for (const key in images) {
  if (key === "plantedFlowers") continue;
  images[key].onload = () => {
    loadedImages++;
    if (loadedImages === totalImages) startAnimation();
  };
}

const flowerSpots = Array.from({ length: 15 }, (_, i) => ({
  x: 100 + i * 60,
  y: canvas.height - 70
}));

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

function getTodayScore(data) {
  const today = new Date().toISOString().split("T")[0];
  const entry = (data || []).find(e => e.date === today);
  return entry ? entry.avgScore : null;
}

const todayScores = [
  getTodayScore(window.overallData),
  getTodayScore(window.mentalData),
  getTodayScore(window.physicalData)
].filter(score => score !== null);

const averageTodayScore = todayScores.length
  ? todayScores.reduce((a, b) => a + b, 0) / todayScores.length
  : 5;

const numBees = Math.min(10, Math.max(1, Math.floor(averageTodayScore)));
const beeSpeed = 0.1 + (averageTodayScore / 10) * 0.4; // slower speed range: 0.1 - 0.5

function getRandomFlower() {
  if (flowerPositions.length > 0) {
    return flowerPositions[Math.floor(Math.random() * flowerPositions.length)];
  } else {
    return {
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height * 0.8
    };
  }
}

const bees = Array.from({ length: numBees }, () => ({
  x: Math.random() * canvas.width,
  y: Math.random() * canvas.height,
  state: "wandering",
  speed: beeSpeed,
  target: getRandomFlower(),
  timer: 0
}));

function updateBee(bee) {
  const target =
    bee.state === "toFlower" ? bee.target :
    bee.state === "returning" ? hivePos :
    null;

  if (target) {
    const dx = target.x - bee.x;
    const dy = target.y - bee.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 5) {
      bee.state = bee.state === "toFlower" ? "pollinating" : "wandering";
      bee.timer = bee.state === "pollinating" ? 60 + Math.random() * 60 : 0;
      bee.target = bee.state === "wandering" ? getRandomFlower() : bee.target;
    } else {
      bee.x += (dx / dist) * bee.speed;
      bee.y += (dy / dist) * bee.speed;
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
