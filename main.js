var roleWorker = require('role.worker');
var config = require('config');
var utils = require('utils');

module.exports.loop = function () {
    // Use excess CPU to generate pixels based on configuration
    if (config.cpu.generatePixels && Game.cpu.bucket >= config.cpu.minBucketLevel) {
        // Only generate pixels if we're above our target bucket level or at max capacity
        if (Game.cpu.bucket >= config.cpu.targetBucketLevel) {
            try {
                Game.cpu.generatePixel();
                console.log(`Generated a pixel. CPU bucket: ${Game.cpu.bucket}`);
            }
            catch (err) {
                console.log(`Failed to generate pixel: ${err}`);
            }
        }
    }
    // Check for creep deaths and mark dangerous areas
    for(var name in Memory.creeps) {
        if(!Game.creeps[name]) {
            // Check if we have position data for this creep
            if (Memory.creeps[name].lastPosition) {
                const pos = Memory.creeps[name].lastPosition;
                const roomName = pos.roomName;
                const ticksToLive = Memory.creeps[name].ticksToLive;

                // Create a RoomPosition object
                const position = new RoomPosition(pos.x, pos.y, roomName);

                // Only mark the area as dangerous if the creep was killed (ticksToLive > 5)
                // If ticksToLive is low, it likely died naturally
                if (ticksToLive > 5) {
                    // Mark the area as dangerous
                    utils.markDangerousArea(position, roomName);
                    console.log(`Creep ${name} was killed at (${pos.x},${pos.y}) in ${roomName} with ${ticksToLive} ticks left. Marking area as dangerous.`);
                } else {
                    console.log(`Creep ${name} died naturally at (${pos.x},${pos.y}) in ${roomName} with ${ticksToLive} ticks left. Not marking as dangerous.`);
                }
            }

            // Clean up the creep's memory
            delete Memory.creeps[name];
            console.log('Clearing non-existing creep memory:', name);
        }
    }

    // Decay dangerous areas
    utils.decayDangerousAreas();

    // Check for high traffic areas and build roads
    utils.buildRoadsOnHighTraffic();

    // Check if spawn is full and build additional energy storage if needed
    for (const roomName in Game.rooms) {
        utils.buildEnergyStorageWhenSpawnFull(Game.rooms[roomName]);
    }

    var workers = _.filter(Game.creeps, (creep) => creep.memory.role == 'worker');

    // Count workers by current task
    var harvesters = _.filter(Game.creeps, (creep) => creep.memory.role == 'worker' && creep.memory.currentTask == 'harvesting');
    var upgraders = _.filter(Game.creeps, (creep) => creep.memory.role == 'worker' && creep.memory.currentTask == 'upgrading');
    var builders = _.filter(Game.creeps, (creep) => creep.memory.role == 'worker' && creep.memory.currentTask == 'building');

    // Determine which body parts to use based on available energy
    var spawn = Game.spawns['Spawn1'];
    var energyAvailable = spawn.room.energyAvailable;
    var bodyParts;

    if (energyAvailable >= 800) {
        bodyParts = config.creepBodyParts.advanced;
    } else if (energyAvailable >= 550) {
        bodyParts = config.creepBodyParts.standard;
    } else {
        bodyParts = config.creepBodyParts.basic;
    }

    // Spawn workers if we need more
    if (workers.length < config.creepCounts.worker) {
        // Determine initial task based on colony needs
        var initialTask = 'harvesting'; // Default to harvesting

        if (harvesters.length >= config.creepCounts.harvester) {
            if (upgraders.length < config.creepCounts.upgrader) {
                initialTask = 'upgrading';
            } else if (builders.length < config.creepCounts.builder) {
                initialTask = 'building';
            }
        }

        var newName = 'Worker' + Game.time;
        spawn.spawnCreep(bodyParts.worker, newName, {
            memory: { 
                role: 'worker',
                currentTask: initialTask
            }
        });
    }

    if(Game.spawns['Spawn1'].spawning) {
        var spawningCreep = Game.creeps[Game.spawns['Spawn1'].spawning.name];
        Game.spawns['Spawn1'].room.visual.text(
            '🛠️' + spawningCreep.memory.role + (spawningCreep.memory.currentTask ? ' (' + spawningCreep.memory.currentTask + ')' : ''),
            Game.spawns['Spawn1'].pos.x + 1,
            Game.spawns['Spawn1'].pos.y,
            {align: 'left', opacity: 0.8});
    }
    for(var name in Game.creeps) {
        var creep = Game.creeps[name];

        // Store the creep's current position and ticksToLive for death detection
        creep.memory.lastPosition = {
            x: creep.pos.x,
            y: creep.pos.y,
            roomName: creep.room.name
        };
        creep.memory.ticksToLive = creep.ticksToLive;

        if(creep.memory.role == 'worker') {
            roleWorker.run(creep);
        }
        // Support for legacy creeps (if any still exist)
        else if(creep.memory.role == 'harvester') {
            // Convert legacy harvester to worker
            creep.memory.role = 'worker';
            creep.memory.currentTask = 'harvesting';
            roleWorker.run(creep);
        }
        else if(creep.memory.role == 'upgrader') {
            // Convert legacy upgrader to worker
            creep.memory.role = 'worker';
            creep.memory.currentTask = 'upgrading';
            roleWorker.run(creep);
        }
        else if(creep.memory.role == 'builder') {
            // Convert legacy builder to worker
            creep.memory.role = 'worker';
            creep.memory.currentTask = 'building';
            roleWorker.run(creep);
        }
    }
}
