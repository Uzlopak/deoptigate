// Copyright 2009 the V8 project authors. All rights reserved.
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are
// met:
//
//     * Redistributions of source code must retain the above copyright
//       notice, this list of conditions and the following disclaimer.
//     * Redistributions in binary form must reproduce the above
//       copyright notice, this list of conditions and the following
//       disclaimer in the documentation and/or other materials provided
//       with the distribution.
//     * Neither the name of Google Inc. nor the names of its
//       contributors may be used to endorse or promote products derived
//       from this software without specific prior written permission.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
// "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
// LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
// A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
// OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
// SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
// LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
// DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
// THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
// (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
// OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.


/**
 * Constructs a Splay tree.  A splay tree is a self-balancing binary
 * search tree with the additional property that recently accessed
 * elements are quick to access again. It performs basic operations
 * such as insertion, look-up and removal in O(log(n)) amortized time.
 *
 * @template T
 * @constructor
 */
function SplayTree() {
};

/**
 * @template T
 * @typedef {{key: number|null, value: T, left: SplayTreeNode<T>|null, right: SplayTreeNode<T>|null}} SplayTreeNode
 */
/**
 * @template T
 * @typedef {{root_: SplayTreeNode<T>|null, isEmpty: () => boolean, splay_: (key: number) => void, findMax: (node?: SplayTreeNode<T>) => SplayTreeNode<T>|null, traverse_: (visitor: (node: SplayTreeNode<T>) => void) => void}} SplayTreeInstance
 */

/**
 * Get the root after the caller has established that the tree is non-empty.
 * @template T
 * @param {SplayTreeInstance<T>} tree
 * @returns {SplayTreeNode<T>}
 */
function rootNode(tree) {
  return /** @type {SplayTreeNode<T>} */ (tree.root_)
}

/**
 * @template T
 * @param {SplayTreeNode<T>} node
 * @returns {number}
 */
function nodeKey(node) {
  return /** @type {number} */ (node.key)
}


/**
 * Pointer to the root node of the tree.
 *
 * @template T
 * @type {SplayTreeNode<T>|null}
 * @private
 */
SplayTree.prototype.root_ = null;


/**
 * @template T
 * @this {SplayTreeInstance<T>}
 * @return {this is SplayTreeInstance<T> & {root_: null}} Whether the tree is empty.
 */
SplayTree.prototype.isEmpty = function() {
  return !this.root_;
};



/**
 * Inserts a node into the tree with the specified key and value if
 * the tree does not already contain a node with the specified key. If
 * the value is inserted, it becomes the root of the tree.
 *
 * @param {number} key Key to insert into the tree.
 * @param {T} value Value to insert into the tree.
 * @template T
 * @this {SplayTreeInstance<T>}
 */
SplayTree.prototype.insert = function(key, value) {
  if (this.isEmpty()) {
    this.root_ = new SplayTree.Node(key, value);
    return;
  }
  // Splay on the key to move the last node on the search path for
  // the key to the root of the tree.
  this.splay_(key);
  if (rootNode(this).key == key) {
    return;
  }
  var node = new SplayTree.Node(key, value);
  const root = rootNode(this)
  if (key > nodeKey(root)) {
    node.left = root;
    node.right = root.right;
    root.right = null;
  } else {
    node.right = root;
    node.left = root.left;
    root.left = null;
  }
  this.root_ = node;
};


/**
 * Removes a node with the specified key from the tree if the tree
 * contains a node with this key. The removed node is returned. If the
 * key is not found, an exception is thrown.
 *
 * @param {number} key Key to find and remove from the tree.
 * @return {SplayTreeNode<T>} The removed node.
 * @template T
 * @this {SplayTreeInstance<T>}
 * @throws {Error} If the key is not in the tree.
 */
SplayTree.prototype.remove = function(key) {
  if (this.isEmpty()) {
    throw Error('Key not found: ' + key);
  }
  this.splay_(key);
  const root = rootNode(this)
  if (root.key != key) {
    throw Error('Key not found: ' + key);
  }
  var removed = root;
  if (!root.left) {
    this.root_ = root.right;
  } else {
    var right = root.right;
    this.root_ = root.left;
    // Splay to make sure that the new root has an empty right child.
    this.splay_(key);
    // Insert the original right child as the right child of the new
    // root.
    rootNode(this).right = right;
  }
  return removed;
};


/**
 * Returns the node having the specified key or null if the tree doesn't contain
 * a node with the specified key.
 *
 * @param {number} key Key to find in the tree.
 * @return {SplayTreeNode<T>|null} Node having the specified key, or null.
 * @template T
 * @this {SplayTreeInstance<T>}
 */
SplayTree.prototype.find = function(key) {
  if (this.isEmpty()) {
    return null;
  }
  this.splay_(key);
  const root = rootNode(this)
  return root.key == key ? root : null;
};


/**
 * @return {SplayTreeNode<T>|null} Node having the minimum key value, or null.
 * @template T
 * @this {SplayTreeInstance<T>}
 */
SplayTree.prototype.findMin = function() {
  if (this.isEmpty()) {
    return null;
  }
  var current = rootNode(this);
  while (current.left) {
    current = current.left;
  }
  return current;
};


/**
 * @param {SplayTreeNode<T>=} opt_startNode Optional subtree root to search from.
 * @return {SplayTreeNode<T>|null} Node having the maximum key value, or null.
 * @template T
 * @this {SplayTreeInstance<T>}
 */
SplayTree.prototype.findMax = function(opt_startNode) {
  if (this.isEmpty()) {
    return null;
  }
  var current = opt_startNode || rootNode(this);
  while (current.right) {
    current = current.right;
  }
  return current;
};


/**
 * @param {number} key Key upper bound to search for.
 * @return {SplayTreeNode<T>|null} Node having the maximum key value that
 *     is less or equal to the specified key value.
 * @template T
 * @this {SplayTreeInstance<T>}
 */
SplayTree.prototype.findGreatestLessThan = function(key) {
  if (this.isEmpty()) {
    return null;
  }
  // Splay on the key to move the node with the given key or the last
  // node on the search path to the top of the tree.
  this.splay_(key);
  // Now the result is either the root node or the greatest node in
  // the left subtree.
  const root = rootNode(this)
  if (nodeKey(root) <= key) {
    return root;
  } else if (root.left) {
    return this.findMax(root.left);
  } else {
    return null;
  }
};


/**
 * @return {Array<[number|null, T]>} An array of each tree node's key and value.
 * @template T
 * @this {SplayTreeInstance<T>}
 */
SplayTree.prototype.exportKeysAndValues = function() {
  /** @type {Array<[number|null, T]>} */
  var result = [];
  this.traverse_(/** @param {SplayTreeNode<T>} node */ function(node) { result.push([node.key, node.value]); });
  return result;
};


/**
 * @return {T[]} An array containing all the values of tree's nodes.
 * @template T
 * @this {SplayTreeInstance<T>}
 */
SplayTree.prototype.exportValues = function() {
  /** @type {T[]} */
  var result = [];
  this.traverse_(/** @param {SplayTreeNode<T>} node */ function(node) { result.push(node.value); });
  return result;
};


/**
 * Perform the splay operation for the given key. Moves the node with
 * the given key to the top of the tree.  If no node has the given
 * key, the last node on the search path is moved to the top of the
 * tree. This is the simplified top-down splaying algorithm from:
 * "Self-adjusting Binary Search Trees" by Sleator and Tarjan
 *
 * @param {number} key Key to splay the tree on.
 * @template T
 * @this {SplayTreeInstance<T>}
 * @private
 */
SplayTree.prototype.splay_ = function(key) {
  if (this.isEmpty()) {
    return;
  }
  // Create a dummy node.  The use of the dummy node is a bit
  // counter-intuitive: The right child of the dummy node will hold
  // the L tree of the algorithm.  The left child of the dummy node
  // will hold the R tree of the algorithm.  Using a dummy node, left
  // and right will always be nodes and we avoid special cases.
  /** @type {SplayTreeNode<T>} */
  const dummy = /** @type {SplayTreeNode<T>} */ (/** @type {unknown} */ (new SplayTree.Node(null, null)))
  var left = dummy
  var right = dummy
  var current = rootNode(this);
  while (true) {
    if (key < nodeKey(current)) {
      if (!current.left) {
        break;
      }
      if (key < nodeKey(current.left)) {
        // Rotate right.
        var tmp = current.left;
        current.left = tmp.right;
        tmp.right = current;
        current = tmp;
        if (!current.left) {
          break;
        }
      }
      // Link right.
      right.left = current;
      right = current;
      current = current.left;
    } else if (key > nodeKey(current)) {
      if (!current.right) {
        break;
      }
      if (key > nodeKey(current.right)) {
        // Rotate left.
        var tmp = current.right;
        current.right = tmp.left;
        tmp.left = current;
        current = tmp;
        if (!current.right) {
          break;
        }
      }
      // Link left.
      left.right = current;
      left = current;
      current = current.right;
    } else {
      break;
    }
  }
  // Assemble.
  left.right = current.left;
  right.left = current.right;
  current.left = dummy.right;
  current.right = dummy.left;
  this.root_ = current;
};


/**
 * Performs a preorder traversal of the tree.
 *
 * @template T
 * @this {SplayTreeInstance<T>}
 * @param {(node: SplayTreeNode<T>) => void} f Visitor function.
 * @private
 */
SplayTree.prototype.traverse_ = function(f) {
  var nodesToVisit = [this.root_];
  while (nodesToVisit.length > 0) {
    var node = nodesToVisit.shift();
    if (node == null) {
      continue;
    }
    f(node);
    nodesToVisit.push(node.left);
    nodesToVisit.push(node.right);
  }
};


/**
 * Constructs a Splay tree node.
 *
 * @param {number|null} key Key. Null is used only by the internal dummy node.
 * @param {T} value Value.
 * @template T
 */
/** @type {new <T>(key: number|null, value: T) => SplayTreeNode<T>} */
SplayTree.Node = /** @type {new <T>(key: number|null, value: T) => SplayTreeNode<T>} */ (
  /** @type {unknown} */ (
  /**
   * @template T
   * @this {SplayTreeNode<T>}
   * @param {number|null} key
   * @param {T} value
   */
  function(key, value) {
  /** @type {number|null} */
  this.key = key;
  /** @type {T} */
  this.value = value;
  }
  )
)


/**
 * @template T
 * @type {SplayTreeNode<T>|null}
 */
SplayTree.Node.prototype.left = null;


/**
 * @template T
 * @type {SplayTreeNode<T>|null}
 */
SplayTree.Node.prototype.right = null;

if (typeof module === 'object' && typeof module.exports === 'object') {
  module.exports = SplayTree;
} 
