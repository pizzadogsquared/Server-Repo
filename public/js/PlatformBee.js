class PlatformBee extends Phaser.Scene {
     constructor() {
         super({ key: 'PlatformBee' });
         this.levelTime = 30;
     }
 
     preload() {
         const safeLoad = (key, path) => {
             if (!this.textures.exists(key)) {
                 this.load.image(key, path);
             }
         };
 
         safeLoad('bee_sprite', 'images/bee.png');
         safeLoad('background_sky', 'images/background_sky.jpg');
         safeLoad('honey_pot', 'images/honey.png');
         safeLoad('cloud', 'images/cloud.png');
     }
 
     create(data) {
         this.parentScene = data?.parentScene || null;
         this.levelTime = 20;
         this.currentLevel = 1;
         this.timeRemaining = this.levelTime;
 
         const sky = this.add.image(0, 0, 'background_sky').setOrigin(0);
         sky.setScale(this.scale.width / sky.width, this.scale.height / sky.height);
 
         this.levelText = this.add.text(400, 20, 'Level 1', { fontSize: '24px', color: '#000' }).setOrigin(0.5);
         this.timeText = this.add.text(20, 20, `Time: ${this.timeRemaining}`, { fontSize: '24px', color: '#000' });
 
         this.platforms = this.physics.add.staticGroup();
         this.bee = this.physics.add.sprite(50, 550, 'bee_sprite');
         this.bee.setScale(0.08).setCollideWorldBounds(true).setBounce(0.2).body.setGravityY(500);
 
         this.honey = this.physics.add.image(750, 50, 'honey_pot').setScale(0.2);
 
         this.createLevel(this.currentLevel);
 
         this.physics.add.collider(this.bee, this.platforms);
         this.physics.add.overlap(this.bee, this.honey, this.collectHoney, null, this);
 
         this.cursors = this.input.keyboard.createCursorKeys();
 
         this.timerEvent = this.time.addEvent({
             delay: 1000,
             callback: this.updateTimer,
             callbackScope: this,
             loop: true
         });
     }
 
     createLevel(level) {
         this.platforms.clear(true, true);
         const layouts = {
             1: [[150, 500], [350, 400], [550, 300], [750, 200], [250, 450], [450, 350]],
             2: [[150, 480], [300, 350], [450, 400], [600, 300], [750, 400]],
             3: [[150, 480], [200, 360], [480, 360], [600, 360], [750, 180]],
             4: [[150, 480], [300, 400], [500, 200], [700, 280], [750, 160]],
             5: [[100, 500], [150, 300], [475, 300], [600, 220], [600, 180], [600, 140], [750, 300]]
         };
         layouts[level].forEach(([x, y]) => {
             this.platforms.create(x, y, 'cloud').setScale(0.20).refreshBody();
         });
         const honeyPositions = {
             1: [750, 160],
             2: [750, 340],
             3: [750, 120],
             4: [750, 100],
             5: [750, 270]
         };
         this.honey.setPosition(...honeyPositions[level]);
         this.bee.setPosition(50, 550);
     }
 
     update() {
         const speed = 160;
         if (this.cursors.left.isDown) {
             this.bee.setVelocityX(-speed);
         } else if (this.cursors.right.isDown) {
             this.bee.setVelocityX(speed);
         } else {
             this.bee.setVelocityX(0);
         }
         if (this.cursors.space.isDown && (this.bee.body.touching.down || this.bee.body.blocked.down)) {
             this.bee.setVelocityY(-450);
         }
     }
 
     updateTimer() {
         this.timeRemaining--;
         this.timeText.setText(`Time: ${this.timeRemaining}`);
         if (this.timeRemaining <= 0) {
             this.timerEvent.remove();
             this.gameOver();
         }
     }
 
     collectHoney() {
         if (this.currentLevel < 5) {
             this.advanceLevel();
         } else {
             this.completeGame();
         }
     }
 
     advanceLevel() {
         this.currentLevel++;
         this.timeRemaining = this.levelTime;
         this.levelText.setText(`Level ${this.currentLevel}`);
         this.physics.pause();
         const levelUpText = this.add.text(400, 300, `Level ${this.currentLevel}!`, { fontSize: '64px', color: '#000' }).setOrigin(0.5);
         this.time.delayedCall(2000, () => {
             levelUpText.destroy();
             this.createLevel(this.currentLevel);
             this.physics.resume();
         });
     }
 
     gameOver() {
         this.physics.pause();
 
         // Container for message
         const box = this.add.rectangle(400, 300, 500, 200, 0xffffff)
             .setStrokeStyle(4, 0xff0000)
             .setOrigin(0.5)
             .setAlpha(0.9);
 
         const gameOverText = this.add.text(400, 280, '⏰ TIME\'S UP!\nTRY AGAIN!', {
             fontFamily: 'monospace',
             fontSize: '28px',
             color: '#ff0000',
             align: 'center'
         }).setOrigin(0.5);
 
         const backButton = this.add.text(400, 350, '↩ BACK TO MENU', {
             fontSize: '24px',
             fontFamily: 'monospace',
             color: '#ffffff',
             backgroundColor: '#ff0000',
             padding: { x: 15, y: 8 }
         }).setOrigin(0.5).setInteractive();
 
         backButton.on('pointerdown', () => {
             document.getElementById('menu').style.display = 'block';
             document.getElementById('renderDiv').style.display = 'none';
             gameInstance.destroy(true);
         });
     }
 
     completeGame() {
         this.physics.pause();
 
         const box = this.add.rectangle(400, 300, 500, 200, 0xffffff)
             .setStrokeStyle(4, 0x000000)
             .setOrigin(0.5)
             .setAlpha(0.9);
 
         const winText = this.add.text(400, 280, '🏆 YOU WON!\nALL LEVELS COMPLETE!', {
             fontFamily: 'monospace',
             fontSize: '26px',
             color: '#000000',
             align: 'center'
         }).setOrigin(0.5);
 
         const backButton = this.add.text(400, 350, '↩ BACK TO MENU', {
             fontSize: '24px',
             fontFamily: 'monospace',
             color: '#ffffff',
             backgroundColor: '#000',
             padding: { x: 15, y: 8 }
         }).setOrigin(0.5).setInteractive();
 
         backButton.on('pointerdown', () => {
             document.getElementById('menu').style.display = 'block';
             document.getElementById('renderDiv').style.display = 'none';
             gameInstance.destroy(true);
         });
     }
 }
