class FlowerGame extends Phaser.Scene {
     constructor() {
         super({ key: 'FlowerGame' });
     }
 
     preload() {
         const safeLoad = (key, path) => {
             if (!this.textures.exists(key)) {
                 this.load.image(key, path);
             }
         };
     
         safeLoad('bee_sprite', 'images/bee.png');
         safeLoad('background_sky', 'images/background_sky.jpg');
         safeLoad('flower', 'images/flower.png');
         safeLoad('cloud', 'images/cloud.png');
     }
 
     create(data) {
         this.parentScene = data?.parentScene || null;
         this.score = 0;
         this.lives = 3;
         this.currentLevel = 1;
         this.levelScoreThreshold = 100;
         this.flowerSpeed = 200;
 
         const sky = this.add.image(0, 0, 'background_sky').setOrigin(0);
         sky.setScale(this.scale.width / sky.width, this.scale.height / sky.height);
 
         this.levelText = this.add.text(400, 20, 'Level 1', { fontSize: '24px', color: '#000' }).setOrigin(0.5);
 
         this.add.text(400, 100, 'Catch the falling flowers!\nMove the bee with your mouse.\nYou have 30 seconds!\nReach 100 points to advance to next level!', {
             fontSize: '24px', color: '#000', align: 'center' }).setOrigin(0.5);
 
         this.scoreText = this.add.text(20, 20, 'Score: 0', { fontSize: '24px', color: '#000' });
         this.livesText = this.add.text(620, 20, '❤️'.repeat(this.lives), { fontSize: '24px', color: '#000' });
 
         this.bee = this.physics.add.image(400, 500, 'bee_sprite');
         this.bee.setScale(0.08);
         this.bee.setCollideWorldBounds(true);
 
         this.flowers = this.physics.add.group();
 
         this.flowerSpawnEvent = this.time.addEvent({ // 👈 CAMBIO AQUÍ
             delay: 1500,
             callback: this.spawnFlower,
             callbackScope: this,
             loop: true
         });
 
         this.time.addEvent({ delay: 1000, callback: this.updateTimer, callbackScope: this, loop: true });
 
         this.input.on('pointermove', pointer => {
             this.bee.x = Phaser.Math.Clamp(pointer.x, 50, 750);
         });
 
         this.countdownText = this.add.text(400, 300, '3', { fontSize: '64px', color: '#000' }).setOrigin(0.5);
         this.time.addEvent({ delay: 1000, repeat: 2, callback: this.updateCountdown, callbackScope: this });
     }
 
     updateCountdown() {
         let num = parseInt(this.countdownText.text);
         if (num > 1) {
             this.countdownText.setText(num - 1);
         } else {
             this.countdownText.destroy();
         }
     }
 
     spawnFlower() {
         const x = Phaser.Math.Between(50, 750);
         const flower = this.flowers.create(x, 0, 'flower').setScale(0.12);
 
         this.flowerSpeed = 200 + 100 * (this.currentLevel - 1);
         flower.setVelocityY(this.flowerSpeed);
 
         this.physics.add.overlap(this.bee, flower, this.collectFlower, null, this);
     }
 
     collectFlower(bee, flower) {
         flower.destroy();
         this.score += 10;
         this.scoreText.setText(`Score: ${this.score}`);
 
         if (this.score >= this.levelScoreThreshold * this.currentLevel && this.currentLevel < 5) {
             this.advanceLevel();
         }
     }
 
     advanceLevel() {
         this.currentLevel++;
         this.physics.pause();
 
         const levelUpText = this.add.text(400, 300, `Level ${this.currentLevel}!`, { fontSize: '64px', color: '#000' }).setOrigin(0.5);
         this.levelText.setText(`Level ${this.currentLevel}`);
 
         this.time.delayedCall(2000, () => {
             levelUpText.destroy();
             this.physics.resume();
         });
     }
 
     loseLife() {
         this.lives--;
         this.livesText.setText('❤️'.repeat(this.lives));
 
         if (this.lives <= 0) {
             this.endGame(false);
         } else {
             const warning = this.add.text(400, 300, `Life Lost! ${this.lives} lives remaining!`, {
                 fontSize: '32px', color: '#ff0000', align: 'center' }).setOrigin(0.5);
             this.time.delayedCall(1000, () => warning.destroy());
         }
     }
 
     endGame(completed = false) {
         this.physics.pause();
 
         if (this.flowerSpawnEvent) { // 👈 NUEVO
             this.flowerSpawnEvent.remove();
         }
         this.flowers.clear(true, true); // 👈 NUEVO
 
         let msg = completed || (this.currentLevel === 5 && this.score >= this.levelScoreThreshold * 5)
             ? `Congratulations!\nYou completed all levels!\nFinal Score: ${this.score}`
             : `Final Score: ${this.score}\nReached Level ${this.currentLevel}`;
 
         if (this.lives <= 0) msg = `Game Over!\nNo lives remaining\n${msg}`;
 
         const finalText = this.add.text(400, 300, msg, {
             fontSize: '48px', color: '#000', align: 'center' }).setOrigin(0.5);
 
         this.time.delayedCall(3000, () => window.location.href = '/games');
     }
 
     update() {
         this.flowers.getChildren().forEach(flower => {
             if (flower.y > 600) {
                 flower.destroy();
                 this.loseLife();
             }
         });
     }
 }
