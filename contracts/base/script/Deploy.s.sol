// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {PayGateReceipts} from "../src/PayGateReceipts.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

/// @title Deploy PayGateReceipts
/// @notice Usage:
///   forge script contracts/base/script/Deploy.s.sol \
///     --rpc-url $PAYGATE_BASE_RPC_URL --broadcast --verify \
///     --sig 'run(address,address,address)' \
///     <usdc_address> <receiver_address> <admin_address>
contract Deploy is Script {
    function run(address usdc, address receiver, address admin) external {
        vm.startBroadcast();
        new PayGateReceipts(IERC20(usdc), receiver, admin);
        vm.stopBroadcast();
    }
}
