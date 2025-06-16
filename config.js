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
        // Minimum number of creep movements over a tile before considering building a road
        threshold: 10,
        // How often to check for new road construction (in ticks)
        checkInterval: 500,
        // Maximum number of roads to build per check interval
        maxRoadsPerCheck: 3,
        // Decay rate for tile usage (how much to reduce counts each check interval)
        decayRate: 0.5
    }
};
