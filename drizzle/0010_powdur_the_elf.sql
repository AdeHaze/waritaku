-- Custom SQL migration file, put your code below! --

ALTER TABLE `articles` ADD `meta_title` text;
ALTER TABLE `articles` ADD `meta_description` text;
ALTER TABLE `pages` ADD `meta_title` text;
ALTER TABLE `pages` ADD `meta_description` text;