const canvas = document.getElementById("bee-animation-canvas");
const ctx = canvas.getContext("2d");

// Make canvas responsive to container size
canvas.width = canvas.offsetWidth;
canvas.height = canvas.offsetHeight;

// Load all images
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

// Wait for all images to load
let loadedImages = 0;
const totalImages = Object.keys(images).length;

for (const key in images) {
  images[key].onload = () => {
    console.log(`${key} loaded`);
    loadedImages++;
    if (loadedImages === totalImages) {
      console.log("All images loaded. Starting animation...");
      startAnimation();
    }
  };
  images[key].onerror = () => {
    console.error(`Failed to load ${key}: ${images[key].src}`);
  };
}

// Prepare bee data
const bees = [];
const wellnessScores = window.wellnessScores || [];
const validScores = wellnessScores.filter(s => typeof s === "number");
const averageScore = validScores.length
  ? validScores.reduce((sum, val) => sum + val, 0) / validScores.length
  : 5;
const numBees = Math.min(10, Math.max(1, Math.round(averageScore)));

for (let i = 0; i < numBees; i++) {
  bees.push({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    dx: Math.random() * 2 - 1,
    dy: Math.random() * 2 - 1,
  });
}

function updateBee(bee) {
  bee.x += bee.dx;
  bee.y += bee.dy;

  if (bee.x < 0 || bee.x > canvas.width) bee.dx *= -1;
  if (bee.y < 0 || bee.y > canvas.height) bee.dy *= -1;
}

function drawBee(bee) {
  ctx.save();
  ctx.translate(bee.x, bee.y);

  const facingLeft = bee.dx < 0;
  ctx.scale(facingLeft ? -1 : 1, 1); // Flip bee based on direction

  // Adjust x-offset when flipping so it draws in the correct position
  ctx.drawImage(images.bee, facingLeft ? -12 : -12, -12, 24, 24);
  ctx.restore();
}

function drawBackground() {
  // Draw background sky
  ctx.drawImage(images.background, 0, 0, canvas.width, canvas.height);

  // House on far left
  ctx.drawImage(images.house, 20, canvas.height - 140, 120, 120);

  const treeWidth = 150;
  const treeX = canvas.width - treeWidth - 20;
  const treeY = canvas.height - 240;
  ctx.drawImage(images.tree, treeX, treeY, treeWidth, 220);

  // Hive hanging from the tree
  ctx.drawImage(images.hive, treeX + 60, treeY + 60, 50, 50);

  // Flower bed (centered at bottom)
  const flowerY = canvas.height - 90;
  const spacing = 60;
  const totalFlowers = 3;
  const flowerWidth = 50;
  const startX = (canvas.width - (flowerWidth * totalFlowers + spacing * (totalFlowers - 1))) / 2;
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

