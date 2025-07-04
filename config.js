/**
 * Configuration file for ScreepHive
 * Contains centralized game constants and settings
 */

module.exports = {
    /**
     * Creep population settings
     */
    creepCounts: {
        worker: 6,  // Total number of workers (replaces individual role counts)
        harvester: 2, // Target number of workers doing harvesting
        upgrader: 1, // Target number of workers doing upgrading
        builder: 3  // Target number of workers doing building
    },

    /**
     * Creep body part configurations
     * These will be used based on available energy
     */
    creepBodyParts: {
        // Basic body parts for early game (300 energy)
        basic: {
            worker: [WORK, CARRY, MOVE],
            harvester: [WORK, CARRY, MOVE],
            upgrader: [WORK, CARRY, MOVE],
            builder: [WORK, CARRY, MOVE]
        },
        // Standard body parts for mid game (550 energy)
        standard: {
            worker: [WORK, WORK, CARRY, CARRY, MOVE, MOVE],
            harvester: [WORK, WORK, CARRY, CARRY, MOVE, MOVE],
            upgrader: [WORK, WORK, CARRY, CARRY, MOVE, MOVE],
            builder: [WORK, WORK, CARRY, CARRY, MOVE, MOVE]
        },
        // Advanced body parts for late game (800+ energy)
        advanced: {
            worker: [WORK, WORK, WORK, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE],
            harvester: [WORK, WORK, WORK, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE],
            upgrader: [WORK, WORK, WORK, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE],
            builder: [WORK, WORK, WORK, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE]
        }
    },

    /**
     * Structure settings
     */
    structures: {
        // Repair threshold (percentage of hits/hitsMax)
        repairThreshold: 0.75,

        // Priority order for construction
        buildPriority: [
            STRUCTURE_SPAWN,
            STRUCTURE_EXTENSION,
            STRUCTURE_TOWER,
            STRUCTURE_STORAGE,
            STRUCTURE_CONTAINER,
            STRUCTURE_ROAD,
            STRUCTURE_WALL,
            STRUCTURE_RAMPART
        ]
    },

    /**
     * Path visualization settings
     */
    pathVisuals: {
        harvest: { stroke: '#ffaa00' },
        build: { stroke: '#ffffff' },
        upgrade: { stroke: '#ffffff' },
        repair: { stroke: '#ffffff' }
    },

    /**
     * Memory settings
     */
    memory: {
        // How often to run memory cleanup (in ticks)
        cleanupInterval: 100
    },

    /**
     * Road automation settings
     */
    roadAutomation: {
        // Whether road automation is enabled
        enabled: true,
        // Minimum cost-weighted usage before considering building a road
        // This is now based on both traffic count and movement cost
        threshold: 20,
        // How often to check for new road construction (in ticks)
        checkInterval: 500,
        // Maximum number of roads to build per check interval
        maxRoadsPerCheck: 3,
        // Decay rate for tile usage (how much to reduce counts each check interval)
        decayRate: 0.5
    },

    /**
     * Dangerous area settings
     */
    dangerousAreas: {
        // Whether dangerous area avoidance is enabled
        enabled: true,
        // Radius around death location to mark as dangerous (in tiles)
        radius: 5,
        // Cost penalty for pathing through dangerous areas
        costPenalty: 50,
        // How long dangerous areas should remain flagged (in ticks)
        duration: 1000,
        // Decay rate for dangerous areas (how much to reduce danger level each tick)
        decayRate: 0.995
    },

    /**
     * CPU and Pixel generation settings
     */
    cpu: {
        // Whether to use excess CPU to generate pixels
        generatePixels: true,
        // Minimum bucket level before generating pixels (max is 10000)
        minBucketLevel: 8000,
        // Target bucket level to maintain (won't generate pixels if below this)
        targetBucketLevel: 9000
    }
};
