var utils = require('utils');
var config = require('config');

var roleWorker = {
    /**
     * Determines the most needed role in the colony
     * @param {Room} room - The room to check
     * @returns {string} - The role that is most needed ('harvester', 'upgrader', or 'builder')
     */
    determineRole: function(room) {
        // Count creeps by role
        var harvesters = _.filter(Game.creeps, (creep) => creep.memory.role == 'worker' && creep.memory.currentTask == 'harvesting');
        var upgraders = _.filter(Game.creeps, (creep) => creep.memory.role == 'worker' && creep.memory.currentTask == 'upgrading');
        var builders = _.filter(Game.creeps, (creep) => creep.memory.role == 'worker' && creep.memory.currentTask == 'building');
        
        // Check if we need harvesters (highest priority)
        if (harvesters.length < config.creepCounts.harvester) {
            return 'harvesting';
        }
        
        // Check if we need upgraders (second priority)
        if (upgraders.length < config.creepCounts.upgrader) {
            return 'upgrading';
        }
        
        // Check if we need builders (third priority)
        if (builders.length < config.creepCounts.builder) {
            return 'building';
        }
        
        // If all roles are filled, check if there are construction sites or repairs needed
        var constructionSites = room.find(FIND_CONSTRUCTION_SITES);
        var repairTargets = room.find(FIND_STRUCTURES, {
            filter: (structure) => {
                return (structure.hits/structure.hitsMax) < config.structures.repairThreshold;
            }
        });
        
        if (constructionSites.length > 0 || repairTargets.length > 0) {
            return 'building';
        }
        
        // Default to upgrading if no specific needs
        return 'upgrading';
    },
    
    /**
     * Performs harvesting tasks (collecting energy and transferring to structures)
     * @param {Creep} creep - The creep to run the harvesting logic on
     */
    runHarvester: function(creep) {
        if(creep.store.getFreeCapacity() > 0) {
            utils.collectEnergy(creep);
        }
        else {
            var targets = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) => {
                    return (structure.structureType == STRUCTURE_EXTENSION ||
                            structure.structureType == STRUCTURE_SPAWN ||
                            structure.structureType == STRUCTURE_TOWER) &&
                        structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
                }
            });
            if(targets.length > 0) {
                if(creep.transfer(targets[0], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                    utils.moveTo(creep, targets[0], {visualizePathStyle: {stroke: '#ffffff'}});
                }
            }
            // If no structures need energy, switch to another role
            else {
                creep.memory.currentTask = this.determineRole(creep.room);
                creep.say('🔄 ' + creep.memory.currentTask);
            }
        }
    },
    
    /**
     * Performs upgrading tasks (upgrading the controller)
     * @param {Creep} creep - The creep to run the upgrading logic on
     */
    runUpgrader: function(creep) {
        if(creep.store[RESOURCE_ENERGY] == 0) {
            utils.collectEnergy(creep);
        }
        else {
            if(creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                utils.moveTo(creep, creep.room.controller, {visualizePathStyle: {stroke: '#ffffff'}});
            }
        }
    },
    
    /**
     * Performs building tasks (building construction sites and repairing structures)
     * @param {Creep} creep - The creep to run the building logic on
     */
    runBuilder: function(creep) {
        if(creep.store[RESOURCE_ENERGY] == 0) {
            utils.collectEnergy(creep);
        }
        else {
            // Priority order for construction: spawn > extension > tower > storage > container > road > wall
            var targets = creep.room.find(FIND_CONSTRUCTION_SITES);
            
            if(targets.length) {
                // Use priority order from config
                const priorityOrder = config.structures.buildPriority;
                
                // Sort targets by priority
                targets.sort((a, b) => {
                    const priorityA = priorityOrder.indexOf(a.structureType);
                    const priorityB = priorityOrder.indexOf(b.structureType);
                    
                    if (priorityA === priorityB) {
                        // If same priority, choose the closest one
                        const distanceA = creep.pos.getRangeTo(a);
                        const distanceB = creep.pos.getRangeTo(b);
                        return distanceA - distanceB;
                    }
                    
                    return priorityA - priorityB;
                });
                
                // Build the highest priority target
                if(creep.build(targets[0]) == ERR_NOT_IN_RANGE) {
                    utils.moveTo(creep, targets[0], {visualizePathStyle: config.pathVisuals.build});
                }
            }
            else {
                // Priority order for repairs: critical structures first, then by damage percentage
                targets = creep.room.find(FIND_STRUCTURES, {
                    filter: (structure) => {
                        return (structure.hits/structure.hitsMax) < config.structures.repairThreshold;
                    }
                });
                
                if(targets.length) {
                    // Sort by damage percentage (most damaged first)
                    targets.sort((a, b) => {
                        const ratioA = a.hits / a.hitsMax;
                        const ratioB = b.hits / b.hitsMax;
                        return ratioA - ratioB;
                    });
                    
                    if(creep.repair(targets[0]) == ERR_NOT_IN_RANGE) {
                        utils.moveTo(creep, targets[0], {visualizePathStyle: config.pathVisuals.repair});
                    }
                }
                // If nothing to build or repair, switch to another role
                else {
                    creep.memory.currentTask = this.determineRole(creep.room);
                    creep.say('🔄 ' + creep.memory.currentTask);
                }
            }
        }
    },
    
    /** @param {Creep} creep **/
    run: function(creep) {
        // Initialize currentTask if not set
        if(!creep.memory.currentTask) {
            creep.memory.currentTask = this.determineRole(creep.room);
            creep.say('🔄 ' + creep.memory.currentTask);
        }
        
        // Periodically check if we should switch roles (every 50 ticks)
        if(Game.time % 50 === 0) {
            var neededRole = this.determineRole(creep.room);
            if(neededRole !== creep.memory.currentTask) {
                creep.memory.currentTask = neededRole;
                creep.say('🔄 ' + creep.memory.currentTask);
            }
        }
        
        // Run the appropriate role logic
        if(creep.memory.currentTask === 'harvesting') {
            this.runHarvester(creep);
        }
        else if(creep.memory.currentTask === 'upgrading') {
            this.runUpgrader(creep);
        }
        else if(creep.memory.currentTask === 'building') {
            this.runBuilder(creep);
        }
    }
};

module.exports = roleWorker;