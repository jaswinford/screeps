/**
 * Configuration file for ScreepHive
 * Contains centralized game constants and settings
 */

module.exports = {
    /**
     * Creep population settings
     */
    creepCounts: {
        harvester: 2,
        upgrader: 1,
        builder: 3
    },

    /**
     * Creep body part configurations
     * These will be used based on available energy
     */
    creepBodyParts: {
        // Basic body parts for early game (300 energy)
        basic: {
            harvester: [WORK, CARRY, MOVE],
            upgrader: [WORK, CARRY, MOVE],
            builder: [WORK, CARRY, MOVE]
        },
        // Standard body parts for mid game (550 energy)
        standard: {
            harvester: [WORK, WORK, CARRY, CARRY, MOVE, MOVE],
            upgrader: [WORK, WORK, CARRY, CARRY, MOVE, MOVE],
            builder: [WORK, WORK, CARRY, CARRY, MOVE, MOVE]
        },
        // Advanced body parts for late game (800+ energy)
        advanced: {
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
    }
};