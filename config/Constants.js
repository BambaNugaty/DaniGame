// Constants.js — single source of truth for gameplay tuning.
// Values here mirror the literals previously scattered through game.js.
// The runtime tweaks panel (window.GAME_TWEAKS) still drives view/enemy-speed
// overrides at runtime; CONST is the static baseline everything else reads from.
(function () {
  'use strict';

  const CONST = {
    PLAYER: {
      START_HEALTH: 100,
      START_MAX_HEALTH: 100,
      START_AMMO: 25,
      MOVE_SPEED: 3.0,
      TURN_SPEED: 2.4,             // rad/s for arrow-key turn
      MOUSE_SENSITIVITY: 0.0025,   // rad per pixel of mouse delta
      MOUSE_DELTA_CLAMP: 80,       // ignore browser mouse spikes beyond this
      BODY_RADIUS: 0.22,
      WALK_BOB_FREQ: 8,
      WALK_BOB_AMP: 4,
      FOOTSTEP_PROB: 0.04,         // per frame while walking
    },

    ENEMY: {
      HP: 30,
      BODY_RADIUS: 0.3,
      MUTUAL_RADIUS: 0.5,          // collision with other enemies
      SIGHT_RANGE: 14,
      CHASE_RANGE_MAX: 18,
      ATTACK_RANGE: 1.0,
      ATTACK_HIT_RANGE: 1.1,
      ATTACK_DAMAGE_MIN: 8,
      ATTACK_DAMAGE_RAND: 8,       // total damage = MIN + rand*RAND
      ATTACK_COOLDOWN: 1.0,
      WANDER_SPEED: 0.4,
      WANDER_TIMER_MIN: 1.5,
      WANDER_TIMER_RAND: 2.5,
      AMBIENT_GRUNT_PROB: 0.003,
      FRAME_CHASE: 0.18,
      FRAME_IDLE: 0.4,
      DEATH_FADE_DURATION: 60,
      VARIANT_COUNT: 3,
      CAP_BASE: 10,                // enemyCapForLevel = CAP_BASE + idx * CAP_PER_LEVEL
      CAP_PER_LEVEL: 2,
    },

    BOSS: {
      HP: 200,
      BODY_RADIUS: 0.35,
      SIGHT_RANGE: 22,
      SPEED_MULT: 1.2,             // multiplied against ENEMY tweaks.enemySpeed
      MELEE_RANGE: 1.6,
      MELEE_HIT_RANGE: 1.7,
      MELEE_DAMAGE_MIN: 18,
      MELEE_DAMAGE_RAND: 8,
      MELEE_COOLDOWN: 0.9,
      THROW_RANGE_MIN: 2.5,
      THROW_RANGE_MAX: 14,
      THROW_COOLDOWN_MIN: 1.4,
      THROW_COOLDOWN_RAND: 0.8,
      THROW_PROJECTILE_SPEED: 7,
      THROW_AIM_JITTER: 0.06,
      SPAWN_DELAY_MIN: 15,         // seconds after level start
      SPAWN_DELAY_RAND: 40,
      RESPAWN_DELAY_MIN: 30,       // after death
      RESPAWN_DELAY_RAND: 30,
      DESPAWN_AFTER_DEATH: 10,
      TAUNT_COOLDOWN_MIN: 6,
      TAUNT_COOLDOWN_RAND: 4,
      FRAME_IDLE: 0.5,
      FRAME_CHASE: 0.2,
      DAMAGE_TAKEN_MULT: 0.8,      // boss takes 80% of player projectile damage
      COIN_DROP_ON_KILL: 14,
    },

    WEAPON: {
      MIN_COOLDOWN: 0.12,
      FIRE_RATE_PER_LEVEL: 0.05,   // cooldown reduction per fireRate upgrade
      DAMAGE_PER_LEVEL: 6,         // damage bonus per damage upgrade

      BLASTER: {
        COOLDOWN: 0.35,
        FIRE_FRAME_DURATION: 0.12,
        SHOTS: 2,
        SPREAD_STEP: 0.04,
        DAMAGE: 18,
        PROJECTILE_SPEED: 12,
      },
      SHOTGUN: {
        COOLDOWN: 0.55,
        FIRE_FRAME_DURATION: 0.18,
        SHOTS: 6,
        SPREAD_STEP: 0.07,
        DAMAGE: 14,
        PROJECTILE_SPEED: 14,
        SECOND_FIRE_SFX_DELAY_MS: 30,
      },

      MUZZLE_FLASH_MS: 100,
      AIM_JITTER: 0.03,
      PROJECTILE_SPAWN_OFFSET: 0.4,
      PROJECTILE_LIFE: 1.2,
      PROJECTILE_HIT_RADIUS: 0.35, // vs friends/enemies
      PROJECTILE_HIT_RADIUS_BOSS: 0.5,
      ENEMY_PROJECTILE_LIFE: 3,
      ENEMY_PROJECTILE_HIT_RADIUS: 0.4,
      COLA_DAMAGE: 14,
      FRIENDLY_FIRE_DAMAGE: 15,    // self-damage for hitting a friend
    },

    PICKUP: {
      PICKUP_RADIUS: 0.45,
      AMMO_RESPAWN: 12,
      HEALTH_RESPAWN: 18,
      HEALTH_AMOUNT: 30,
      AMMO_AMOUNT: 16,
      COIN_PICKUP_RADIUS: 0.5,
      COIN_LIFE: 30,
      COIN_BOB_SPEED: 4,
      DROP_PICKUP_RADIUS_SQ: 0.25,  // 0.5*0.5 — kept as squared for hot loop
      AMMO_SPRINKLE_BASE: 10,
      AMMO_SPRINKLE_PER_LEVEL: 2,
      HEALTH_SPRINKLE_BASE: 6,
      HEALTH_SPRINKLE_PER_LEVEL: 1,
      COINS_PER_KILL_MIN: 1,
      COINS_PER_KILL_RAND: 2,
    },

    FRIEND: {
      BODY_RADIUS: 0.25,
      WANDER_SPEED: 0.6,
      WANDER_TIMER_MIN: 2,
      WANDER_TIMER_RAND: 3,
      FRAME_TIMING: 0.4,
      LOVE_BUBBLE_SECS: 2.5,
    },

    WAVE: {
      INITIAL_TIMER_MIN: 8,
      INITIAL_TIMER_RAND: 6,
      RECUR_TIMER_MIN: 10,
      RECUR_TIMER_RAND: 6,
      BURST_MIN: 1,
      BURST_RAND: 2,
    },

    ECONOMY: {
      PRICES: { damage: 8, fireRate: 10, multishot: 15 },
      MAX_LVL: { damage: 5, fireRate: 4, multishot: 3 },
      PRICE_SCALE_FACTOR: 0.6,     // currentPrice = base + lvl * ceil(base * factor)
      HP_BOOST_BASE_PRICE: 12,
      HP_BOOST_AMOUNT: 10,
      HP_BOOST_TIER_INCREMENT: 6,
      FULL_HEAL_PRICE: 8,
    },

    AUDIO: {
      MUSIC_BASE_GAIN: 0.14,
      MUSIC_TENSION_GAIN: 0.18,
      MUSIC_TENSION_RANGE: 12,     // tile distance at which tension fades to 0
      MUSIC_FADE_MS: 600,
      BOSS_TENSION: 0.9,
    },

    UI: {
      DAMAGE_FLASH_MS: 200,
      BANNER_MS: 1800,
      BOSS_MSG_MS: 2400,
      KARMA_MSG_MS: 1100,
      VOLUME_TOAST_MS: 1100,
      RECENT_HURT_DURATION: 0.6,
      RECENT_KILL_DURATION: 0.8,
      RECENT_KILL_DURATION_BOSS: 1.5,
      LEVEL_TRANSITION_MS: 1400,
      VICTORY_DELAY_MS: 800,
      DEATH_DELAY_MS: 600,
    },
  };

  window.CONST = CONST;
})();
