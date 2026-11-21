// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Four-by-four horizontal arena, four levels. A cell is x + 4*y + 16*z.
/// A reservation covers its cells for one UTC minute. Synthetic sandbox only.
contract VoxelAir {
    uint256 public constant LOCK_SECONDS = 90;
    struct Booking {
        address owner;
        uint64 minute;
        uint128 quote; // zero means not for sale
        bool active;
        bool departed;
        uint8[] cells;
    }
    mapping(bytes32 => Booking) public bookings;
    mapping(uint64 => mapping(uint8 => bytes32)) public occupant;
    event Reserved(bytes32 indexed id, address indexed owner, uint64 minute);
    event Released(bytes32 indexed id);
    event Bought(bytes32 indexed oldId, bytes32 indexed newId, address indexed seller, uint256 paid);
    event Departed(bytes32 indexed id);
    error Occupied(uint8 cell, bytes32 by);
    error Locked();
    error Invalid();
    error WrongPrice();
    error PayoutFailed();

    function reservePath(bytes32 salt, uint64 minute, uint8[] calldata cells, uint128 quote) external returns (bytes32) {
        return _reserve(salt, minute, cells, quote);
    }
    function _reserve(bytes32 salt, uint64 minute, uint8[] calldata cells, uint128 quote) internal returns (bytes32 id) {
        if (uint256(minute)*60 <= block.timestamp + LOCK_SECONDS) revert Locked();
        id = keccak256(abi.encode(msg.sender,salt));
        if (bookings[id].owner != address(0) || cells.length == 0 || cells.length > 16) revert Invalid();
        Booking storage b = bookings[id];
        b.owner = msg.sender; b.minute = minute; b.quote = quote; b.active = true;
        for (uint256 i; i < cells.length; i++) {
            uint8 cell = cells[i];
            if (cell >= 64) revert Invalid();
            bytes32 by = occupant[minute][cell];
            if (by != bytes32(0)) revert Occupied(cell,by);
            occupant[minute][cell] = id;
            b.cells.push(cell);
        }
        emit Reserved(id,msg.sender,minute);
    }
    function _mutable(Booking storage b) internal view {
        if (!b.active) revert Invalid();
        if (b.departed || uint256(b.minute)*60 <= block.timestamp + LOCK_SECONDS) revert Locked();
    }
    function _release(bytes32 id) internal {
        Booking storage b = bookings[id];
        _mutable(b);
        b.active = false;
        for (uint256 i; i < b.cells.length; i++) delete occupant[b.minute][b.cells[i]];
        emit Released(id);
    }
    function release(bytes32 id) external {
        if (bookings[id].owner != msg.sender) revert Invalid();
        _release(id);
    }
    function markDeparted(bytes32 id) external {
        Booking storage b = bookings[id];
        if (!b.active || b.owner != msg.sender || b.departed) revert Invalid();
        b.departed = true;
        emit Departed(id);
    }
    /// Buyer may atomically replace their alternative reservation in the same minute.
    function buyoutPath(bytes32 sellerId, bytes32 alternative, bytes32 salt, uint8[] calldata cells) external payable returns (bytes32 id) {
        Booking storage seller = bookings[sellerId];
        _mutable(seller);
        if (msg.sender == seller.owner || seller.quote == 0 || msg.value != seller.quote) revert WrongPrice();
        bool overlap;
        for (uint256 i; i < cells.length; i++) {
            if (occupant[seller.minute][cells[i]] == sellerId) overlap = true;
        }
        if (!overlap) revert Invalid();
        if (alternative != bytes32(0)) {
            Booking storage alt = bookings[alternative];
            if (alt.owner != msg.sender || alt.minute != seller.minute) revert Invalid();
            _release(alternative);
        }
        _release(sellerId);
        id = _reserve(salt,seller.minute,cells,0);
        (bool paid,) = payable(seller.owner).call{value:msg.value}("");
        if (!paid) revert PayoutFailed();
        emit Bought(sellerId,id,seller.owner,msg.value);
    }
}
